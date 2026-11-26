import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { action, chaveAcesso, cnpjDestinatario, tokenFocus, ambiente } = await req.json();

    if (!tokenFocus || !String(tokenFocus).trim()) {
      return new Response(
        JSON.stringify({
          error:
            "Token da API Fiscal (Focus NFe) não configurado. Configure o token em Configuração Fiscal -> SEFAZ & Baixa contra CNPJ para baixar os itens e valores reais direto da SEFAZ, ou importe o arquivo .xml da NF-e.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = String(tokenFocus).trim();
    const authHeader = `Basic ${btoa(`${token}:`)}`;
    const baseUrl =
      ambiente === "producao"
        ? "https://api.focusnfe.com.br/v2"
        : "https://homologacao.focusnfe.com.br/v2";

    if (action === "listar") {
      const cnpjLimpo = String(cnpjDestinatario || "").replace(/\D/g, "");
      if (cnpjLimpo.length !== 14) {
        return new Response(
          JSON.stringify({ error: "CNPJ da empresa inválido." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const res = await fetch(`${baseUrl}/nfes_recebidas?cnpj=${cnpjLimpo}`, {
        headers: { Authorization: authHeader },
      });
      const text = await res.text();
      return new Response(text, {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chaveLimpa = String(chaveAcesso || "").replace(/\D/g, "");
    if (chaveLimpa.length !== 44) {
      return new Response(
        JSON.stringify({ error: "Chave de acesso inválida (deve ter 44 dígitos)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Tenta baixar XML completo de NF-e recebida (emitida por fornecedor contra o CNPJ)
    const xmlRecebidaRes = await fetch(`${baseUrl}/nfes_recebidas/${chaveLimpa}.xml`, {
      headers: { Authorization: authHeader, Accept: "application/xml, text/xml" },
    });

    if (xmlRecebidaRes.ok) {
      const xml = await xmlRecebidaRes.text();
      if (xml.includes("<infNFe")) {
        return new Response(JSON.stringify({ xmlText: xml, origem: "focus_nfes_recebidas" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 2. Consulta metadados em nfes_recebidas para ver se requer manifestação ou URL do XML
    const jsonRecebidaRes = await fetch(`${baseUrl}/nfes_recebidas/${chaveLimpa}`, {
      headers: { Authorization: authHeader, Accept: "application/json" },
    });

    if (jsonRecebidaRes.ok) {
      const body = await jsonRecebidaRes.json();
      if (body?.caminho_xml_nota_fiscal) {
        const xmlUrl = body.caminho_xml_nota_fiscal.startsWith("http")
          ? body.caminho_xml_nota_fiscal
          : `https://api.focusnfe.com.br${body.caminho_xml_nota_fiscal}`;
        const xmlRes = await fetch(xmlUrl, { headers: { Authorization: authHeader } });
        if (xmlRes.ok) {
          const xml = await xmlRes.text();
          if (xml.includes("<infNFe")) {
            return new Response(JSON.stringify({ xmlText: xml, origem: "focus_nfes_recebidas" }), {
              status: 200,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }
    }

    // 3. Fallback: verifica se a nota foi emitida pela própria conta Focus NFe
    const emitidaRes = await fetch(`${baseUrl}/nfe/${chaveLimpa}?completa=1`, {
      headers: { Authorization: authHeader, Accept: "application/json, application/xml" },
    });
    if (emitidaRes.ok) {
      const ct = emitidaRes.headers.get("content-type") || "";
      if (ct.includes("xml")) {
        const xml = await emitidaRes.text();
        if (xml.includes("<infNFe")) {
          return new Response(JSON.stringify({ xmlText: xml, origem: "focus_api" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        const body = await emitidaRes.json();
        if (body?.caminho_xml_nota_fiscal) {
          const xmlRes = await fetch(`https://api.focusnfe.com.br${body.caminho_xml_nota_fiscal}`);
          if (xmlRes.ok) {
            const xml = await xmlRes.text();
            if (xml.includes("<infNFe")) {
              return new Response(JSON.stringify({ xmlText: xml, origem: "focus_api" }), {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        error:
          "A SEFAZ / Focus NFe ainda não retornou o XML completo desta chave. Verifique se o módulo NF-e Recebidas (DF-e) está ativo na sua conta Focus NFe ou faça o upload do arquivo .xml enviado pelo fornecedor.",
      }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || "Erro interno ao consultar SEFAZ." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
