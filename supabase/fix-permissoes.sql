-- ============================================================
-- CORREÇÃO DE PERMISSÕES DO SUPABASE (PERMISSION DENIED)
-- Execute este script no SQL Editor do Supabase
-- ============================================================

-- 1. Dar permissão de acesso ao schema public
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 2. Conceder permissões totais em todas as tabelas para usuários autenticados
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- 3. Conceder permissões em sequências (auto-incremento de IDs)
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

-- 4. Garantir que tabelas futuras também recebam as permissões
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon;
