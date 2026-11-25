import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCadastroModal } from '@/contexts/CadastroModalContext';
import ProdutoModal from '@/components/ProdutoModal';
import ClienteModal from '@/components/ClienteModal';

const COLUNAS_VALIDAS_PRODUTOS = [
  'codigo', 'codigo_fabrica', 'codigo_interno', 'nome', 'marca', 'aplicacao',
  'ncm', 'preco_venda', 'markup_percentual', 'estoque_minimo', 'estoque_total',
  'categoria', 'tipo_veiculo', 'icms_percentual', 'ipi_percentual',
  'pis_percentual', 'cofins_percentual', 'localizacao', 'imagem_url', 'imagens'
];

export default function GlobalCadastros() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [savingProduto, setSavingProduto] = useState(false);

  const {
    isProdutoOpen,
    isProdutoMinimized,
    produtoData,
    closeProdutoModal,
    minimizeProdutoModal,
    restoreProdutoModal,
    onProdutoSavedCallback,

    isClienteOpen,
    isClienteMinimized,
    clienteData,
    closeClienteModal,
    minimizeClienteModal,
    restoreClienteModal,
    onClienteSavedCallback,
  } = useCadastroModal();

  const handleSaveProduto = async (data: Record<string, any>) => {
    setSavingProduto(true);
    try {
      const lote = data._lote;
      delete data._lote;
      delete data.preco_custo;
      delete data.frete_custo;

      const cleanPayload: Record<string, any> = {};
      for (const col of COLUNAS_VALIDAS_PRODUTOS) {
        if (data[col] !== undefined) {
          cleanPayload[col] = data[col];
        }
      }

      const qtdLote = Math.max(0, Math.round(Number(lote?.quantidade || 0)));
      const custoLote = Number(lote?.preco_custo || 0);
      const fornLote = (lote?.fornecedor || cleanPayload.marca || '—').trim();

      let savedProduct: any = null;

      if (produtoData?.id) {
        // Atualização de produto existente: se informou quantidade, soma ao estoque atual
        if (qtdLote > 0) {
          const { data: atual } = await (supabase as any)
            .from('produtos')
            .select('estoque_total')
            .eq('id', produtoData.id)
            .maybeSingle();
          const estoquePrevio = Number(atual?.estoque_total ?? produtoData.estoque_total ?? 0);
          cleanPayload.estoque_total = estoquePrevio + qtdLote;
        }

        const { data: updated, error } = await (supabase as any)
          .from('produtos')
          .update(cleanPayload)
          .eq('id', produtoData.id)
          .select()
          .single();
        if (error) throw error;
        savedProduct = updated;

        if (qtdLote > 0 || custoLote > 0) {
          await (supabase as any).from('lotes').insert({
            produto_id: produtoData.id,
            fornecedor: fornLote,
            preco_custo: custoLote,
            quantidade: qtdLote,
          });
        }

        toast({
          title: 'Peça atualizada com sucesso!',
          description: qtdLote > 0 ? `+${qtdLote} un somada(s) ao estoque (Total: ${savedProduct.estoque_total}).` : undefined,
        });
      } else {
        // Verifica se já existe peça com o mesmo código para somar ao estoque em vez de dar erro de duplicidade
        const codBusca = (cleanPayload.codigo || '').trim();
        let prodExistente: any = null;
        if (codBusca) {
          const { data: found } = await (supabase as any)
            .from('produtos')
            .select('id, estoque_total')
            .eq('codigo', codBusca)
            .limit(1);
          if (found && found.length > 0) {
            prodExistente = found[0];
          }
        }

        if (prodExistente) {
          const novoEstoque = Number(prodExistente.estoque_total || 0) + qtdLote;
          cleanPayload.estoque_total = novoEstoque;
          const { data: updated, error } = await (supabase as any)
            .from('produtos')
            .update(cleanPayload)
            .eq('id', prodExistente.id)
            .select()
            .single();
          if (error) throw error;
          savedProduct = updated;

          if (qtdLote > 0 || custoLote > 0) {
            await (supabase as any).from('lotes').insert({
              produto_id: prodExistente.id,
              fornecedor: fornLote,
              preco_custo: custoLote,
              quantidade: qtdLote,
            });
          }

          toast({
            title: 'Estoque somado ao produto existente!',
            description: `${savedProduct.nome}: +${qtdLote} un (Estoque atual: ${novoEstoque}).`,
          });
        } else {
          // Novo cadastro de produto já com estoque_total definido
          cleanPayload.estoque_total = qtdLote;
          const { data: inserted, error } = await (supabase as any)
            .from('produtos')
            .insert(cleanPayload)
            .select()
            .single();
          if (error) throw error;
          savedProduct = inserted;

          if (inserted && (fornLote || custoLote > 0 || qtdLote > 0)) {
            await (supabase as any).from('lotes').insert({
              produto_id: inserted.id,
              fornecedor: fornLote,
              preco_custo: custoLote,
              quantidade: qtdLote,
            });
          }

          toast({
            title: 'Peça cadastrada com sucesso!',
            description: `Estoque inicial registrado: ${qtdLote} un.`,
          });
        }
      }

      // Invalida cache de produtos no React Query
      queryClient.invalidateQueries({ queryKey: ['produtos'] });
      queryClient.invalidateQueries({ queryKey: ['produtos-search'] });
      queryClient.invalidateQueries({ queryKey: ['produtos-categorias'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-produtos'] });
      queryClient.invalidateQueries({ queryKey: ['lotes'] });

      if (onProdutoSavedCallback) {
        onProdutoSavedCallback(savedProduct);
      }

      closeProdutoModal();
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar produto',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSavingProduto(false);
    }
  };

  const handleSaveCliente = (saved: any) => {
    queryClient.invalidateQueries({ queryKey: ['clientes'] });
    queryClient.invalidateQueries({ queryKey: ['clientes-search'] });
    if (onClienteSavedCallback) {
      onClienteSavedCallback(saved);
    }
  };

  return (
    <>
      {isProdutoOpen && (
        <ProdutoModal
          isOpen={isProdutoOpen}
          isMinimized={isProdutoMinimized}
          onMinimize={minimizeProdutoModal}
          onRestore={restoreProdutoModal}
          produto={produtoData}
          onClose={closeProdutoModal}
          onSave={handleSaveProduto}
          saving={savingProduto}
        />
      )}

      {isClienteOpen && (
        <div className={isProdutoMinimized && isClienteMinimized ? 'translate-y-[-80px]' : ''}>
          <ClienteModal
            isOpen={isClienteOpen}
            isMinimized={isClienteMinimized}
            onMinimize={minimizeClienteModal}
            onRestore={restoreClienteModal}
            cliente={clienteData}
            onClose={closeClienteModal}
            onSaved={handleSaveCliente}
          />
        </div>
      )}
    </>
  );
}
