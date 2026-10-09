-- AlterEnum: ação de auditoria para o encerramento de sessões. O valor novo fica
-- sozinho nesta migração: o Postgres não deixa usá-lo na mesma transação em que
-- é criado.
ALTER TYPE "audit_action" ADD VALUE 'SESSION_REVOKE';
