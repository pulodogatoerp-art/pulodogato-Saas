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

      let insertedId = produtoData?.id;
      let savedProduct: any = null;

      if (produtoData?.id) {
        // Atualização de produto existente
        const { data: updated, error } = await (supabase as any)
          .from('produtos')
          .update(cleanPayload)
          .eq('id', produtoData.id)
          .select()
          .single();
        if (error) throw error;
        savedProduct = updated;
        toast({ title: 'Peça atualizada com sucesso!' });
      } else {
        // Novo cadastro de produto
        const { data: inserted, error } = await (supabase as any)
          .from('produtos')
          .insert(cleanPayload)
          .select()
          .single();
        if (error) throw error;
        savedProduct = inserted;
        insertedId = inserted.id;

        // Se informou lote inicial
        if (inserted && lote && (lote.fornecedor || lote.preco_custo > 0 || lote.quantidade > 0)) {
          await (supabase as any).from('lotes').insert({
            produto_id: inserted.id,
            fornecedor: lote.fornecedor || '—',
            preco_custo: lote.preco_custo || 0,
            quantidade: lote.quantidade || 0,
          });

          if (lote.quantidade > 0) {
            await (supabase as any)
              .from('produtos')
              .update({ estoque_total: lote.quantidade })
              .eq('id', inserted.id);
            savedProduct.estoque_total = lote.quantidade;
          }
        }

        toast({ title: 'Peça cadastrada com sucesso!' });
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
