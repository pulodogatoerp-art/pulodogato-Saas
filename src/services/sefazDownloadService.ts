import { supabase } from '@/integrations/supabase/client';
import { calcularDvChave } from './nfeService';

export interface ChaveDecodificada {
  valida: boolean;
  motivoInvalido?: string;
  chaveLimpa: string;
  chaveFormatada: string;
  cUF: string;
  ufSigla: string;
  anoMes: string;
  cnpjEmitente: string;
  modelo: string;
  modeloNome: string;
  serie: string;
  numero: string;
  tipoEmissao: string;
  codigoNumerico: string;
  digitoVerificador: number;
}

export interface NotaRecebidaDFe {
  chaveAcesso: string;
  numero: string;
  serie: string;
  emitenteNome: string;
  emitenteCnpj: string;
  destinatarioCnpj: string;
  dataEmissao: string;
  valorTotal: number;
  status: 'autorizada' | 'cancelada' | 'pendente';
  temXmlLocal: boolean;
  nsu?: string;
}

const UF_CODIGOS: Record<string, string> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
  '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL',
  '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP', '41': 'PR',
  '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
};

// Formata chave em 11 grupos de 4 dígitos
export function formatarChave44(chave: string): string {
  const limpo = chave.replace(/\D/g, '').slice(0, 44);
  return limpo.replace(/(\d{4})/g, '$1 ').trim();
}

// Formata CNPJ (00.000.000/0000-00)
export function formatarCnpj(cnpj: string): string {
  const limpo = cnpj.replace(/\D/g, '').padStart(14, '0').slice(0, 14);
  return limpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

// Decodifica e valida a estrutura da chave de 44 dígitos da SEFAZ
export function decodificarChaveAcesso(chaveRaw: string): ChaveDecodificada {
  const chaveLimpa = chaveRaw.replace(/\D/g, '');

  if (chaveLimpa.length !== 44) {
    return {
      valida: false,
      motivoInvalido: `A chave possui ${chaveLimpa.length} dígitos (o padrão oficial da SEFAZ exige exatamente 44 dígitos).`,
      chaveLimpa,
      chaveFormatada: formatarChave44(chaveLimpa),
      cUF: '', ufSigla: '', anoMes: '', cnpjEmitente: '', modelo: '', modeloNome: '', serie: '', numero: '', tipoEmissao: '', codigoNumerico: '', digitoVerificador: 0,
    };
  }

  const cUF = chaveLimpa.slice(0, 2);
  const ano = '20' + chaveLimpa.slice(2, 4);
  const mes = chaveLimpa.slice(4, 6);
  const cnpjEmitente = chaveLimpa.slice(6, 20);
  const modelo = chaveLimpa.slice(20, 22);
  const serie = chaveLimpa.slice(22, 25);
  const numero = String(parseInt(chaveLimpa.slice(25, 34), 10));
  const tipoEmissao = chaveLimpa.slice(34, 35);
  const codigoNumerico = chaveLimpa.slice(35, 43);
  const dvEsperado = parseInt(chaveLimpa.slice(43, 44), 10);

  const dvCalculado = calcularDvChave(chaveLimpa.slice(0, 43));
  const dvValido = dvCalculado === dvEsperado;

  const ufSigla = UF_CODIGOS[cUF] || 'BR';
  const modeloNome = modelo === '55' ? 'NF-e (Modelo 55)' : modelo === '65' ? 'NFC-e (Modelo 65)' : `Modelo ${modelo}`;

  return {
    valida: dvValido,
    motivoInvalido: dvValido ? undefined : `Dígito verificador inválido (calculado: ${dvCalculado}, informado: ${dvEsperado}). Verifique a chave digitada.`,
    chaveLimpa,
    chaveFormatada: formatarChave44(chaveLimpa),
    cUF,
    ufSigla,
    anoMes: `${mes}/${ano}`,
    cnpjEmitente: formatarCnpj(cnpjEmitente),
    modelo,
    modeloNome,
    serie,
    numero,
    tipoEmissao,
    codigoNumerico,
    digitoVerificador: dvEsperado,
  };
}

// Busca o XML real de uma NF-e por chave de acesso diretamente da SEFAZ / Focus NFe
export async function baixarXmlSefazPorChave(params: {
  chaveAcesso: string;
  cnpjDestinatario: string;
  tokenFocus?: string;
  ambiente?: 'homologacao' | 'producao';
}): Promise<{ xmlText: string; origem: 'focus_api' | 'sefaz_dfe' | 'banco_local' }> {
  const chaveLimpa = params.chaveAcesso.replace(/\D/g, '');
  if (chaveLimpa.length !== 44) {
    throw new Error('Chave de acesso inválida. Deve conter exatamente 44 dígitos numéricos.');
  }

  const dec = decodificarChaveAcesso(chaveLimpa);
  if (!dec.valida && dec.motivoInvalido) {
    throw new Error(dec.motivoInvalido);
  }

  // 1. Verificar se o XML real já foi importado anteriormente no banco local
  // (Ignora XMLs sintéticos antigos marcados com SEFAZ_DFe_Distribuicao_v4.00)
  try {
    const { data: notaExistente } = await (supabase as any)
      .from('nfe_importadas')
      .select('xml_raw, chave_acesso')
      .eq('chave_acesso', chaveLimpa)
      .maybeSingle();

    if (
      notaExistente?.xml_raw &&
      notaExistente.xml_raw.includes('<infNFe') &&
      !notaExistente.xml_raw.includes('SEFAZ_DFe_Distribuicao_v4.00')
    ) {
      return { xmlText: notaExistente.xml_raw, origem: 'banco_local' };
    }
  } catch (err) {
    console.warn('Consulta no banco local aviso:', err);
  }

  // 2. Consulta direta na SEFAZ via Edge Function `sefaz-dfe` (usa Certificado Digital A1 ou Token Focus NFe)
  try {
    const { data: fnData, error: fnErr } = await supabase.functions.invoke('sefaz-dfe', {
      body: {
        action: 'baixar',
        chaveAcesso: chaveLimpa,
        cnpjDestinatario: params.cnpjDestinatario,
        tokenFocus: params.tokenFocus?.trim() || undefined,
        // NF-es reais emitidas por fornecedores contra o CNPJ estão no ambiente de Produção da SEFAZ
        ambiente: 'producao',
      },
    });

    if (!fnErr && fnData?.xmlText && fnData.xmlText.includes('<infNFe')) {
      return { xmlText: fnData.xmlText, origem: fnData.origem || 'sefaz_dfe' };
    }
    if (fnData?.error) {
      throw new Error(fnData.error);
    }
    if (fnErr) {
      const ctx = (fnErr as any)?.context;
      if (ctx instanceof Response) {
        const errBody = await ctx.json().catch(() => null);
        if (errBody?.error) throw new Error(errBody.error);
      }
      throw new Error(fnErr.message);
    }
  } catch (edgeErr: any) {
    // Se não houver token Focus, propaga o erro real da SEFAZ/A1 em vez de gerar dados falsos
    if (!params.tokenFocus || !params.tokenFocus.trim()) {
      throw new Error(
        edgeErr?.message ||
          `Chave decodificada (NF nº ${dec.numero} · Série ${dec.serie} · CNPJ ${dec.cnpjEmitente}), mas não foi possível baixar o XML da SEFAZ. Verifique a senha do Certificado A1 em Configuração Fiscal.`
      );
    }
  }

  // 3. Fallback: se houver token Focus NFe e a Edge Function falhou, tenta Focus direta
  if (params.tokenFocus && params.tokenFocus.trim()) {

    try {
      const endpointPrefix = params.ambiente === 'producao'
        ? 'https://api.focusnfe.com.br/v2'
        : 'https://homologacao.focusnfe.com.br/v2';

      // Endpoint oficial de NF-es recebidas contra o CNPJ (DF-e)
      const resRecebida = await fetch(`${endpointPrefix}/nfes_recebidas/${chaveLimpa}.xml`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${btoa(`${params.tokenFocus.trim()}:`)}`,
          'Accept': 'application/xml, text/xml',
        },
      });

      if (resRecebida.ok) {
        const xml = await resRecebida.text();
        if (xml.includes('<infNFe')) {
          return { xmlText: xml, origem: 'sefaz_dfe' };
        }
      }

      // Fallback: nota emitida na própria conta Focus NFe
      const resEmitida = await fetch(`${endpointPrefix}/nfe/${chaveLimpa}?completa=1`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${btoa(`${params.tokenFocus.trim()}:`)}`,
          'Accept': 'application/json, application/xml',
        },
      });

      if (resEmitida.ok) {
        const contentType = resEmitida.headers.get('content-type') || '';
        if (contentType.includes('xml')) {
          const xml = await resEmitida.text();
          if (xml.includes('<infNFe')) {
            return { xmlText: xml, origem: 'focus_api' };
          }
        } else {
          const body = await resEmitida.json();
          if (body.caminho_xml_nota_fiscal) {
            const xmlRes = await fetch(`https://api.focusnfe.com.br${body.caminho_xml_nota_fiscal}`);
            if (xmlRes.ok) {
              const xml = await xmlRes.text();
              if (xml.includes('<infNFe')) {
                return { xmlText: xml, origem: 'focus_api' };
              }
            }
          }
        }
      }
    } catch (apiErr) {
      console.warn('API Focus NFe falhou:', apiErr);
    }

    throw new Error(
      `Chave válida (NF nº ${dec.numero} · CNPJ ${dec.cnpjEmitente}), mas a API Focus NFe não retornou o XML dos itens. Verifique se o Token está correto e com DF-e (NF-es Recebidas) habilitado, ou faça o upload do arquivo .xml da nota.`
    );
  }

  // Nunca gera itens falsos (ex.: R$ 150,00) quando não há conexão SEFAZ configurada
  throw new Error(
    `Chave decodificada (NF nº ${dec.numero} · Série ${dec.serie} · CNPJ ${dec.cnpjEmitente}), porém o navegador não consegue baixar os itens e valores direto da SEFAZ sem o Token da API Fiscal (Focus NFe) configurado em Configuração Fiscal. Configure o Token ou importe usando "Upload de Arquivo XML".`
  );
}

// Lista notas fiscais emitidas contra o CNPJ da empresa
export async function listarNotasEmitidasContraCnpj(params: {
  cnpjDestinatario: string;
  tokenFocus?: string;
  ambiente?: 'homologacao' | 'producao';
}): Promise<NotaRecebidaDFe[]> {
  const cnpjLimpo = params.cnpjDestinatario.replace(/\D/g, '');

  // 1. Consulta notas já registradas no banco local com tipo = 'entrada'
  const { data: locais } = await (supabase as any)
    .from('nfe_importadas')
    .select('*')
    .order('data_emissao', { ascending: false })
    .limit(30);

  const notasLocais: NotaRecebidaDFe[] = (locais ?? []).map((n: any) => ({
    chaveAcesso: n.chave_acesso,
    numero: n.numero || '1',
    serie: n.serie || '1',
    emitenteNome: n.emitente_nome || 'FORNECEDOR',
    emitenteCnpj: n.emitente_cnpj || '',
    destinatarioCnpj: n.destinatario_cnpj || cnpjLimpo,
    dataEmissao: n.data_emissao,
    valorTotal: Number(n.valor_total || 0),
    status: (n.status === 'cancelada' ? 'cancelada' : 'autorizada') as any,
    temXmlLocal: Boolean(n.xml_raw),
  }));

  // Se já temos notas locais, retornamos elas
  if (notasLocais.length > 0) {
    return notasLocais;
  }

  // 2. Se a lista local estiver vazia e houver API Focus configurada, consulta DFe
  if (params.tokenFocus && params.tokenFocus.trim()) {
    try {
      const endpoint = params.ambiente === 'producao'
        ? `https://api.focusnfe.com.br/v2/nfes_recebidas?cnpj=${cnpjLimpo}`
        : `https://homologacao.focusnfe.com.br/v2/nfes_recebidas?cnpj=${cnpjLimpo}`;

      const res = await fetch(endpoint, {
        headers: { 'Authorization': `Basic ${btoa(`${params.tokenFocus.trim()}:`)}` },
      });
      if (res.ok) {
        const body = await res.json();
        if (Array.isArray(body)) {
          return body.map((item: any) => ({
            chaveAcesso: item.chave_nfe || item.chave,
            numero: String(item.numero || '1'),
            serie: String(item.serie || '1'),
            emitenteNome: item.nome_emitente || 'Fornecedor',
            emitenteCnpj: item.cnpj_emitente || '',
            destinatarioCnpj: cnpjLimpo,
            dataEmissao: (item.data_emissao || new Date().toISOString()).split('T')[0],
            valorTotal: Number(item.valor_total || 0),
            status: item.situacao === 'cancelada' ? 'cancelada' : 'autorizada',
            temXmlLocal: false,
            nsu: item.nsu,
          }));
        }
      }
    } catch (e) {
      console.warn('Erro ao consultar DFe Focus:', e);
    }
  }

  return [];
}
