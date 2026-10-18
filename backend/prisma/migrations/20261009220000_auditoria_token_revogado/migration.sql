-- AlterEnum: ação de auditoria para o uso de um refresh token que já foi
-- cortado (logout, sessão encerrada, reset de senha). O valor novo fica sozinho
-- nesta migração: o Postgres não deixa usá-lo na mesma transação em que é criado.
ALTER TYPE "audit_action" ADD VALUE 'REVOKED_TOKEN_USE';
