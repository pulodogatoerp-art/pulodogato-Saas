-- ====================================================================
-- PEÇAFÁCIL PRO - SCHEMA COMPLETO (COMPATIBILIDADE TOTAL SUPABASE)
-- ====================================================================

-- 1. TIPO CUSTOMIZADO APP_ROLE
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'vendedor', 'caixa', 'estoque');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. FUNÇÃO DE TIMESTAMP UPDATED_AT
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Perfil visivel pelo proprio usuario" ON public.profiles;
CREATE POLICY "Perfil visivel pelo proprio usuario" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Usuario atualiza proprio perfil" ON public.profiles;
CREATE POLICY "Usuario atualiza proprio perfil" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- 4. USER_ROLES
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'vendedor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role::TEXT FROM public.user_roles WHERE user_id = _user_id LIMIT 1;
$$;

DROP POLICY IF EXISTS "Admins gerenciam roles" ON public.user_roles;
CREATE POLICY "Admins gerenciam roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Usuario ve proprio role" ON public.user_roles;
CREATE POLICY "Usuario ve proprio role" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- TRIGGER AUTOMÁTICO: O primeiro usuário criado torna-se Administrador automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER SECURITY DEFINER LANGUAGE plpgsql AS $$
DECLARE
  is_first_user BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, nome)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO is_first_user;

  IF is_first_user THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'vendedor')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. PRODUTOS
CREATE TABLE IF NOT EXISTS public.produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  codigo_fabrica TEXT DEFAULT '',
  codigo_interno TEXT DEFAULT '',
  nome TEXT NOT NULL,
  marca TEXT NOT NULL DEFAULT '',
  aplicacao TEXT NOT NULL DEFAULT '',
  ncm TEXT NOT NULL DEFAULT '',
  preco_venda NUMERIC(12,2) NOT NULL DEFAULT 0,
  markup_percentual NUMERIC NOT NULL DEFAULT 0,
  estoque_minimo INTEGER NOT NULL DEFAULT 0,
  estoque_total INTEGER NOT NULL DEFAULT 0,
  categoria TEXT NOT NULL DEFAULT 'Outros',
  tipo_veiculo TEXT DEFAULT '',
  icms_percentual NUMERIC DEFAULT 0,
  ipi_percentual NUMERIC DEFAULT 0,
  pis_percentual NUMERIC DEFAULT 0,
  cofins_percentual NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados leem produtos" ON public.produtos;
CREATE POLICY "Autenticados leem produtos" ON public.produtos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins gerenciam produtos" ON public.produtos;
CREATE POLICY "Admins gerenciam produtos" ON public.produtos FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6. LOTES (FIFO)
CREATE TABLE IF NOT EXISTS public.lotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id UUID NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  fornecedor TEXT NOT NULL DEFAULT '',
  preco_custo NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantidade INTEGER NOT NULL DEFAULT 0,
  data_entrada DATE NOT NULL DEFAULT CURRENT_DATE,
  nfe_chave TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados leem lotes" ON public.lotes;
CREATE POLICY "Autenticados leem lotes" ON public.lotes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins gerenciam lotes" ON public.lotes;
CREATE POLICY "Admins gerenciam lotes" ON public.lotes FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.decrement_stock(pid UUID, qty INTEGER)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.produtos
  SET estoque_total = GREATEST(0, estoque_total - qty),
      updated_at = now()
  WHERE id = pid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decrement_stock(UUID, INTEGER) TO authenticated;

-- 7. NFE_IMPORTADAS
CREATE TABLE IF NOT EXISTS public.nfe_importadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave_acesso TEXT NOT NULL UNIQUE,
  numero TEXT NOT NULL,
  serie TEXT NOT NULL DEFAULT '',
  emitente_cnpj TEXT NOT NULL,
  emitente_nome TEXT NOT NULL DEFAULT '',
  destinatario_cnpj TEXT,
  data_emissao DATE NOT NULL,
  valor_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  tipo TEXT NOT NULL DEFAULT 'entrada',
  status TEXT NOT NULL DEFAULT 'processada',
  xml_raw TEXT,
  imported_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.nfe_importadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados leem nfe" ON public.nfe_importadas;
CREATE POLICY "Autenticados leem nfe" ON public.nfe_importadas FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Autenticados inserem nfe" ON public.nfe_importadas;
CREATE POLICY "Autenticados inserem nfe" ON public.nfe_importadas FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Admins gerenciam nfe" ON public.nfe_importadas;
CREATE POLICY "Admins gerenciam nfe" ON public.nfe_importadas FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 8. CLIENTES
CREATE TABLE IF NOT EXISTS public.clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cpf_cnpj TEXT NOT NULL DEFAULT '',
  telefone TEXT NOT NULL DEFAULT '',
  whatsapp TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  endereco TEXT NOT NULL DEFAULT '',
  observacoes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados gerenciam clientes" ON public.clientes;
CREATE POLICY "Autenticados gerenciam clientes" ON public.clientes FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 9. CONFIGURACOES
CREATE TABLE IF NOT EXISTS public.configuracoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave TEXT NOT NULL UNIQUE,
  valor TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados leem configuracoes" ON public.configuracoes;
CREATE POLICY "Autenticados leem configuracoes" ON public.configuracoes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins gerenciam configuracoes" ON public.configuracoes;
CREATE POLICY "Admins gerenciam configuracoes" ON public.configuracoes FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.configuracoes (chave, valor) VALUES
  ('empresa_nome', 'PeçaFácil AutoPeças'),
  ('empresa_cnpj', ''),
  ('empresa_ie', 'ISENTO'),
  ('empresa_endereco', ''),
  ('empresa_cidade', 'Campo Grande'),
  ('empresa_uf', 'MS'),
  ('empresa_cep', '79000-000'),
  ('empresa_telefone', ''),
  ('empresa_email', ''),
  ('markup_padrao', '30'),
  ('comissao_percentual', '5'),
  ('moeda', 'BRL'),
  ('icms_percentual', '17'),
  ('ipi_percentual', '0'),
  ('pis_percentual', '1.65'),
  ('cofins_percentual', '7.6'),
  ('infinitepay_habilitado', 'false'),
  ('mercadopago_habilitado', 'false'),
  ('nfe_ambiente', 'homologacao'),
  ('nfe_regime_tributario', '1'),
  ('nfe_serie', '1'),
  ('nfe_proximo_numero', '1'),
  ('nfe_natureza_operacao', 'Venda de mercadoria adquirida de terceiros'),
  ('nfe_cfop_padrao', '5102'),
  ('nfe_cfop_interestadual', '6102'),
  ('nfe_focus_token', '')
ON CONFLICT (chave) DO NOTHING;

-- 10. ORCAMENTOS
CREATE TABLE IF NOT EXISTS public.orcamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT NOT NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nome TEXT NOT NULL DEFAULT '',
  validade DATE,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  desconto NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  frete_transportadora TEXT NOT NULL DEFAULT '',
  frete_valor NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente',
  observacoes TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados gerenciam orcamentos" ON public.orcamentos;
CREATE POLICY "Autenticados gerenciam orcamentos" ON public.orcamentos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 11. ITENS_ORCAMENTO
CREATE TABLE IF NOT EXISTS public.itens_orcamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id UUID REFERENCES public.orcamentos(id) ON DELETE CASCADE NOT NULL,
  produto_id UUID REFERENCES public.produtos(id) ON DELETE SET NULL,
  produto_nome TEXT NOT NULL DEFAULT '',
  produto_codigo TEXT NOT NULL DEFAULT '',
  produto_codigo_fabrica TEXT DEFAULT '',
  produto_codigo_interno TEXT DEFAULT '',
  produto_marca TEXT DEFAULT '',
  quantidade INTEGER NOT NULL DEFAULT 1,
  preco_unitario NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0
);

ALTER TABLE public.itens_orcamento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados gerenciam itens_orcamento" ON public.itens_orcamento;
CREATE POLICY "Autenticados gerenciam itens_orcamento" ON public.itens_orcamento FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 12. VENDAS
CREATE TABLE IF NOT EXISTS public.vendas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id UUID REFERENCES public.orcamentos(id) ON DELETE SET NULL,
  numero TEXT NOT NULL,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  cliente_nome TEXT NOT NULL DEFAULT '',
  total NUMERIC NOT NULL DEFAULT 0,
  forma_pagamento TEXT NOT NULL DEFAULT 'Dinheiro',
  frete_transportadora TEXT NOT NULL DEFAULT '',
  frete_valor NUMERIC NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados gerenciam vendas" ON public.vendas;
CREATE POLICY "Autenticados gerenciam vendas" ON public.vendas FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 13. ITENS_VENDA
CREATE TABLE IF NOT EXISTS public.itens_venda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id UUID REFERENCES public.vendas(id) ON DELETE CASCADE NOT NULL,
  produto_id UUID REFERENCES public.produtos(id) ON DELETE SET NULL,
  produto_nome TEXT NOT NULL DEFAULT '',
  produto_codigo TEXT NOT NULL DEFAULT '',
  produto_codigo_fabrica TEXT DEFAULT '',
  produto_codigo_interno TEXT DEFAULT '',
  produto_marca TEXT DEFAULT '',
  quantidade INTEGER NOT NULL DEFAULT 1,
  preco_unitario NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0
);

ALTER TABLE public.itens_venda ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Autenticados gerenciam itens_venda" ON public.itens_venda;
CREATE POLICY "Autenticados gerenciam itens_venda" ON public.itens_venda FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 14. API_KEYS
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  escopos TEXT[] NOT NULL DEFAULT ARRAY['produtos:read','estoque:read'],
  ativo BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins gerenciam api_keys" ON public.api_keys;
CREATE POLICY "Admins gerenciam api_keys" ON public.api_keys FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 15. STORAGE BUCKET: CERTIFICADOS-A1
INSERT INTO storage.buckets (id, name, public)
VALUES ('certificados-a1', 'certificados-a1', false)
ON CONFLICT (id) DO NOTHING;

-- 16. PERMISSÕES GLOBAIS (GRANTS) PARA PUBLIC / AUTHENTICATED
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon;

