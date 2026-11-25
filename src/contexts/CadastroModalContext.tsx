import React, { createContext, useContext, useState, useCallback } from 'react';
import { ProdutoModalData } from '@/components/ProdutoModal';
import { ClienteData } from '@/components/ClienteModal';

interface CadastroModalContextType {
  // Produto Modal
  isProdutoOpen: boolean;
  isProdutoMinimized: boolean;
  produtoData?: ProdutoModalData;
  openProdutoModal: (produto?: ProdutoModalData, onSuccess?: (data?: any) => void) => void;
  closeProdutoModal: () => void;
  minimizeProdutoModal: () => void;
  restoreProdutoModal: () => void;
  onProdutoSavedCallback?: (data?: any) => void;

  // Cliente Modal
  isClienteOpen: boolean;
  isClienteMinimized: boolean;
  clienteData?: ClienteData;
  openClienteModal: (cliente?: ClienteData, onSuccess?: (data?: any) => void) => void;
  closeClienteModal: () => void;
  minimizeClienteModal: () => void;
  restoreClienteModal: () => void;
  onClienteSavedCallback?: (data?: any) => void;
}

const CadastroModalContext = createContext<CadastroModalContextType | undefined>(undefined);

export function CadastroModalProvider({ children }: { children: React.ReactNode }) {
  // Estado Produto
  const [isProdutoOpen, setIsProdutoOpen] = useState(false);
  const [isProdutoMinimized, setIsProdutoMinimized] = useState(false);
  const [produtoData, setProdutoData] = useState<ProdutoModalData | undefined>(undefined);
  const [onProdutoSavedCallback, setOnProdutoSavedCallback] = useState<((data?: any) => void) | undefined>(undefined);

  // Estado Cliente
  const [isClienteOpen, setIsClienteOpen] = useState(false);
  const [isClienteMinimized, setIsClienteMinimized] = useState(false);
  const [clienteData, setClienteData] = useState<ClienteData | undefined>(undefined);
  const [onClienteSavedCallback, setOnClienteSavedCallback] = useState<((data?: any) => void) | undefined>(undefined);

  // Ações Produto
  const openProdutoModal = useCallback((produto?: ProdutoModalData, onSuccess?: (data?: any) => void) => {
    setProdutoData(produto);
    setIsProdutoOpen(true);
    setIsProdutoMinimized(false);
    setOnProdutoSavedCallback(() => onSuccess);
  }, []);

  const closeProdutoModal = useCallback(() => {
    setIsProdutoOpen(false);
    setIsProdutoMinimized(false);
    setProdutoData(undefined);
    setOnProdutoSavedCallback(undefined);
  }, []);

  const minimizeProdutoModal = useCallback(() => {
    setIsProdutoMinimized(true);
  }, []);

  const restoreProdutoModal = useCallback(() => {
    setIsProdutoMinimized(false);
  }, []);

  // Ações Cliente
  const openClienteModal = useCallback((cliente?: ClienteData, onSuccess?: (data?: any) => void) => {
    setClienteData(cliente);
    setIsClienteOpen(true);
    setIsClienteMinimized(false);
    setOnClienteSavedCallback(() => onSuccess);
  }, []);

  const closeClienteModal = useCallback(() => {
    setIsClienteOpen(false);
    setIsClienteMinimized(false);
    setClienteData(undefined);
    setOnClienteSavedCallback(undefined);
  }, []);

  const minimizeClienteModal = useCallback(() => {
    setIsClienteMinimized(true);
  }, []);

  const restoreClienteModal = useCallback(() => {
    setIsClienteMinimized(false);
  }, []);

  return (
    <CadastroModalContext.Provider
      value={{
        isProdutoOpen,
        isProdutoMinimized,
        produtoData,
        openProdutoModal,
        closeProdutoModal,
        minimizeProdutoModal,
        restoreProdutoModal,
        onProdutoSavedCallback,

        isClienteOpen,
        isClienteMinimized,
        clienteData,
        openClienteModal,
        closeClienteModal,
        minimizeClienteModal,
        restoreClienteModal,
        onClienteSavedCallback,
      }}
    >
      {children}
    </CadastroModalContext.Provider>
  );
}

export function useCadastroModal() {
  const context = useContext(CadastroModalContext);
  if (!context) {
    throw new Error('useCadastroModal deve ser usado dentro de um CadastroModalProvider');
  }
  return context;
}
