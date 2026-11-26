import { createClient } from 'npm:@supabase/supabase-js@2';
import forge from 'npm:node-forge@1.3.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonReply = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const UF_CODES: Record<string, string> = {
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17',
  MA: '21', PI: '22', CE: '23', RN: '24', PB: '25', PE: '26', AL: '27',
  SE: '28', BA: '29', MG: '31', ES: '32', RJ: '33', SP: '35', PR: '41',
  SC: '42', RS: '43', MS: '50', MT: '51', GO: '52', DF: '53',
};

async function gunzipBase64(b64: string): Promise<string> {
  const bin = Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0));
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([bin]).stream().pipeThrough(ds);
  return await new Response(stream).text();
}

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'i'));
  return m ? m[1].trim() : '';
}

function extractAllTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1].trim());
  }
  return out;
}

async function postSoapHttp11(urlStr: string, soapBody: string, certPem: string, keyPem: string): Promise<string> {
  const client = (Deno as any).createHttpClient({
    certChain: certPem,
    privateKey: keyPem,
    cert: certPem,
    key: keyPem,
    http2: false,
    http1: true,
  });
  try {
    const res = await fetch(urlStr, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
      },
      body: soapBody,
      client,
    } as any);
    return await res.text();
  } finally {
    try {
      client?.close?.();
    } catch {
      // ignore
    }
  }
}

async function loadA1Credentials(admin: any, configMap: Record<string, string>) {
  const arquivo = configMap['nfe_certificado_arquivo'] || '';
  const senha = configMap['nfe_certificado_senha'] || '';

  let pfxBytes: Uint8Array | null = null;
  let password = senha;

  // 1. Tenta carregar o arquivo .pfx direto do bucket certificados-a1/empresa/
  if (arquivo) {
    const { data: fileBlob, error: dlErr } = await admin.storage
      .from('certificados-a1')
      .download(`empresa/${arquivo}`);
    if (!dlErr && fileBlob) {
      pfxBytes = new Uint8Array(await fileBlob.arrayBuffer());
    }
  }

  // 2. Fallback: lista arquivos em certificados-a1/empresa/ para achar qualquer .pfx/.p12
  if (!pfxBytes) {
    const { data: files } = await admin.storage.from('certificados-a1').list('empresa', { limit: 10 });
    const pfxFile = (files || []).find((f: any) => /\.(pfx|p12)$/i.test(f.name));
    if (pfxFile) {
      const { data: fileBlob } = await admin.storage
        .from('certificados-a1')
        .download(`empresa/${pfxFile.name}`);
      if (fileBlob) {
        pfxBytes = new Uint8Array(await fileBlob.arrayBuffer());
      }
    }
  }

  // 3. Fallback: verifica se existe a1.enc criptografado
  if (!pfxBytes) {
    const encryption = Deno.env.get('A1_STORAGE_ENCRYPTION_KEY');
    if (encryption) {
      const { data: encBlob } = await admin.storage.from('certificados-a1').download('empresa/a1.enc');
      if (encBlob) {
        const buf = new Uint8Array(await encBlob.arrayBuffer());
        const iv = buf.slice(1, 13);
        const cipher = buf.slice(13);
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(encryption));
        const aesKey = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['decrypt']);
        const plain = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('pecafacil:a1:v1') },
          aesKey,
          cipher
        );
        const parsed = JSON.parse(new TextDecoder().decode(plain));
        const rawStr = forge.util.decode64(parsed.pfx);
        pfxBytes = Uint8Array.from(rawStr, (c) => c.charCodeAt(0));
        password = parsed.password || password;
      }
    }
  }

  if (!pfxBytes) {
    throw new Error('Certificado Digital A1 (.pfx) não encontrado no Storage. Reenvie o certificado em Configuração Fiscal.');
  }
  if (!password) {
    throw new Error('Senha do Certificado Digital A1 não configurada. Salve a senha em Configuração Fiscal -> Certificado Digital A1.');
  }

  let binaryStr = '';
  for (const b of pfxBytes) binaryStr += String.fromCharCode(b);

  let p12: any;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(binaryStr), false, password);
  } catch (pfxErr: any) {
    throw new Error(
      'Senha do Certificado Digital A1 incorreta ou incompatível com o arquivo .pfx salvo. Acesse Configuração Fiscal -> Certificado Digital A1, informe a senha correta do certificado e salve novamente.'
    );
  }
  const keyBags = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ];
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];

  const privKey = keyBags.find((b: any) => b.key)?.key;
  if (!privKey) throw new Error('Chave privada não encontrada no arquivo .pfx.');

  const mainCertBag =
    certBags.find(
      (b: any) =>
        b.cert &&
        b.cert.publicKey.n?.equals(privKey.n) &&
        b.cert.publicKey.e?.equals(privKey.e)
    ) || certBags[0];

  if (!mainCertBag?.cert) throw new Error('Certificado X.509 não encontrado no arquivo .pfx.');

  // Garante que o certificado folha (correspondente à chave privada) venha PRIMEIRO na cadeia
  const otherCerts = certBags.filter((b: any) => b.cert && b !== mainCertBag);
  const certChainPem = [mainCertBag, ...otherCerts]
    .map((b: any) => forge.pki.certificateToPem(b.cert))
    .join('\n');
  const keyPem = forge.pki.privateKeyToPem(privKey);
  const certDerB64 = forge.util.encode64(
    forge.asn1.toDer(forge.pki.certificateToAsn1(mainCertBag.cert)).getBytes()
  );

  return { certPem: certChainPem, keyPem, privKey, certDerB64 };
}

function buildDistDFeSoap(params: {
  tpAmb: string;
  cUFAutor: string;
  cnpj: string;
  chaveAcesso?: string;
  ultNSU?: string;
}) {
  const inner = params.chaveAcesso
    ? `<consChNFe><chNFe>${params.chaveAcesso}</chNFe></consChNFe>`
    : `<distNSU><ultNSU>${(params.ultNSU || '000000000000000').padStart(15, '0')}</ultNSU></distNSU>`;

  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        <distDFeInt versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe">
          <tpAmb>${params.tpAmb}</tpAmb>
          <cUFAutor>${params.cUFAutor}</cUFAutor>
          <CNPJ>${params.cnpj}</CNPJ>
          ${inner}
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;
}

function signManifestacaoXml(params: {
  chaveAcesso: string;
  cnpj: string;
  tpAmb: string;
  privKey: any;
  certDerB64: string;
}) {
  const tpEvento = '210210'; // Ciência da Operação
  const nSeqEvento = '1';
  const id = `ID${tpEvento}${params.chaveAcesso}01`;
  const dhEvento = new Date().toISOString().replace(/\.\d{3}Z$/, '-04:00');

  const infEvento =
    `<infEvento xmlns="http://www.portalfiscal.inf.br/nfe" Id="${id}">` +
    `<cOrgao>91</cOrgao>` +
    `<tpAmb>${params.tpAmb}</tpAmb>` +
    `<CNPJ>${params.cnpj}</CNPJ>` +
    `<chNFe>${params.chaveAcesso}</chNFe>` +
    `<dhEvento>${dhEvento}</dhEvento>` +
    `<tpEvento>${tpEvento}</tpEvento>` +
    `<nSeqEvento>${nSeqEvento}</nSeqEvento>` +
    `<verEvento>1.00</verEvento>` +
    `<detEvento versao="1.00"><descEvento>Ciencia da Operacao</descEvento></detEvento>` +
    `</infEvento>`;

  const md1 = forge.md.sha1.create();
  md1.update(infEvento, 'utf8');
  const digestValue = forge.util.encode64(md1.digest().bytes());

  const signedInfo =
    `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>` +
    `<Reference URI="#${id}">` +
    `<Transforms>` +
    `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>` +
    `<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
    `</Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>` +
    `<DigestValue>${digestValue}</DigestValue>` +
    `</Reference>` +
    `</SignedInfo>`;

  const md2 = forge.md.sha1.create();
  md2.update(signedInfo, 'utf8');
  const signatureValue = forge.util.encode64(params.privKey.sign(md2));

  const signature =
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
    signedInfo +
    `<SignatureValue>${signatureValue}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${params.certDerB64}</X509Certificate></X509Data></KeyInfo>` +
    `</Signature>`;

  const evento = `<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">${infEvento}${signature}</evento>`;
  const idLote = String(Date.now()).slice(-15);

  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeRecepcaoEventoNF xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">
      <nfeDadosMsg>
        <envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
          <idLote>${idLote}</idLote>
          ${evento}
        </envEvento>
      </nfeDadosMsg>
    </nfeRecepcaoEventoNF>
  </soap12:Body>
</soap12:Envelope>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, chaveAcesso, cnpjDestinatario, tokenFocus, ambiente } = body;

    const url = Deno.env.get('SUPABASE_URL');
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !service) {
      return jsonReply({ error: 'Ambiente Supabase não configurado.' }, 500);
    }

    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Carrega configurações do banco
    const { data: cfgRows } = await admin.from('configuracoes').select('chave, valor');
    const configMap: Record<string, string> = {};
    (cfgRows || []).forEach((r: any) => {
      configMap[r.chave] = r.valor;
    });

    const effectiveToken = (tokenFocus || configMap['nfe_focus_token'] || '').trim();
    const effectiveCnpj = String(cnpjDestinatario || configMap['empresa_cnpj'] || '').replace(/\D/g, '');
    const ufSigla = (configMap['empresa_uf'] || 'MS').toUpperCase();
    const cUFAutor = UF_CODES[ufSigla] || '50';
    // Para consulta de NF-e recebida de fornecedor real, usa ambiente configurado ou produção por padrão
    const tpAmb = (ambiente || configMap['nfe_ambiente'] || 'producao') === 'homologacao' ? '2' : '1';

    // 1. Se houver Token Focus NFe configurado, tenta Focus primeiro
    if (effectiveToken) {
      const authHeader = `Basic ${btoa(`${effectiveToken}:`)}`;
      const baseUrl =
        tpAmb === '1'
          ? 'https://api.focusnfe.com.br/v2'
          : 'https://homologacao.focusnfe.com.br/v2';

      if (action === 'listar' && effectiveCnpj.length === 14) {
        const res = await fetch(`${baseUrl}/nfes_recebidas?cnpj=${effectiveCnpj}`, {
          headers: { Authorization: authHeader },
        });
        if (res.ok) {
          return new Response(await res.text(), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } else if (chaveAcesso) {
        const chaveLimpa = String(chaveAcesso).replace(/\D/g, '');
        const xmlRes = await fetch(`${baseUrl}/nfes_recebidas/${chaveLimpa}.xml`, {
          headers: { Authorization: authHeader, Accept: 'application/xml, text/xml' },
        });
        if (xmlRes.ok) {
          const xml = await xmlRes.text();
          if (xml.includes('<infNFe')) {
            return jsonReply({ xmlText: xml, origem: 'focus_nfes_recebidas' });
          }
        }
      }
    }

    // 2. Consulta DIRETA à SEFAZ Nacional (NFeDistribuicaoDFe) via Certificado Digital A1 (.pfx)
    if (effectiveCnpj.length !== 14) {
      return jsonReply({ error: 'CNPJ da empresa não configurado em Configuração Fiscal.' }, 400);
    }

    const { certPem, keyPem, privKey, certDerB64 } = await loadA1Credentials(admin, configMap);

    const distEndpoint =
      tpAmb === '1'
        ? 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx'
        : 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx';

    if (action === 'listar') {
      const soap = buildDistDFeSoap({ tpAmb, cUFAutor, cnpj: effectiveCnpj, ultNSU: '0' });
      const xmlResp = await postSoapHttp11(distEndpoint, soap, certPem, keyPem);
      const docs = extractAllTags(xmlResp, 'docZip');
      const notas: any[] = [];
      for (const b64 of docs) {
        const docXml = await gunzipBase64(b64);
        const ch = extractTag(docXml, 'chNFe');
        if (!ch) continue;
        notas.push({
          chaveAcesso: ch,
          numero: String(parseInt(ch.slice(25, 34), 10) || '1'),
          serie: ch.slice(22, 25),
          emitenteNome: extractTag(docXml, 'xNome') || 'Fornecedor',
          emitenteCnpj: extractTag(docXml, 'CNPJ') || ch.slice(6, 20),
          destinatarioCnpj: effectiveCnpj,
          dataEmissao: (extractTag(docXml, 'dhEmi') || new Date().toISOString()).split('T')[0],
          valorTotal: parseFloat(extractTag(docXml, 'vNF') || '0'),
          status: 'autorizada',
          temXmlLocal: docXml.includes('<infNFe'),
        });
      }
      return jsonReply({ notas });
    }

    const chaveLimpa = String(chaveAcesso || '').replace(/\D/g, '');
    if (chaveLimpa.length !== 44) {
      return jsonReply({ error: 'Chave de acesso inválida (deve conter 44 dígitos).' }, 400);
    }

    const soap1 = buildDistDFeSoap({ tpAmb, cUFAutor, cnpj: effectiveCnpj, chaveAcesso: chaveLimpa });
    const xmlResp1 = await postSoapHttp11(distEndpoint, soap1, certPem, keyPem);
    let cStat = extractTag(xmlResp1, 'cStat');
    let xMotivo = extractTag(xmlResp1, 'xMotivo');
    let docs = extractAllTags(xmlResp1, 'docZip');

    // Verifica se já veio o XML completo (<infNFe)
    for (const b64 of docs) {
      const docXml = await gunzipBase64(b64);
      if (docXml.includes('<infNFe')) {
        return jsonReply({ xmlText: docXml, origem: 'sefaz_dfe' });
      }
    }

    // Se veio apenas resumo (<resNFe>) ou se precisa manifestar Ciência da Operação (210210)
    const eventoEndpoint =
      tpAmb === '1'
        ? 'https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx'
        : 'https://hom.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx';

    const eventoSoap = signManifestacaoXml({
      chaveAcesso: chaveLimpa,
      cnpj: effectiveCnpj,
      tpAmb,
      privKey,
      certDerB64,
    });

    await postSoapHttp11(eventoEndpoint, eventoSoap, certPem, keyPem).catch(() => null);

    // Reconsulta a SEFAZ após ciência da operação
    const soap2 = buildDistDFeSoap({ tpAmb, cUFAutor, cnpj: effectiveCnpj, chaveAcesso: chaveLimpa });
    const xmlResp2 = await postSoapHttp11(distEndpoint, soap2, certPem, keyPem);
    cStat = extractTag(xmlResp2, 'cStat') || cStat;
    xMotivo = extractTag(xmlResp2, 'xMotivo') || xMotivo;
    docs = extractAllTags(xmlResp2, 'docZip');

    for (const b64 of docs) {
      const docXml = await gunzipBase64(b64);
      if (docXml.includes('<infNFe')) {
        return jsonReply({ xmlText: docXml, origem: 'sefaz_dfe' });
      }
    }

    return jsonReply(
      {
        error: `SEFAZ retornou (${cStat || 'sem código'}): ${xMotivo || 'XML completo ainda não disponibilizado pela SEFAZ.'}`,
      },
      404
    );
  } catch (err: any) {
    const rawMsg = String(err?.message || '');
    const isSefazTlsOrHttp =
      rawMsg.includes('HTTP/1.1') ||
      rawMsg.includes('Connection reset') ||
      rawMsg.includes('ECONNRESET') ||
      rawMsg.includes('http2 error');

    const friendlyMsg = isSefazTlsOrHttp
      ? 'O servidor da SEFAZ Nacional recusou a conexão direta em nuvem (exige HTTP/1.1 mTLS com IP dedicado). Para baixar os itens e valores reais pela chave de 44 dígitos, configure o Token da API Fiscal (Focus NFe) em Configuração Fiscal → SEFAZ & Baixa contra CNPJ, ou utilize a aba "Upload de Arquivo XML" com o .xml do fornecedor.'
      : rawMsg || 'Erro ao consultar SEFAZ com Certificado A1.';

    return jsonReply({ error: friendlyMsg }, isSefazTlsOrHttp ? 502 : 500);
  }
});
