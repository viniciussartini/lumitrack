-- AlterEnum: meta de demanda em kW (teto mensal de pico, só Grupo A). O novo
-- valor fica sozinho nesta migração: o Postgres não deixa usá-lo na mesma
-- transação em que é criado.
ALTER TYPE "goal_unit" ADD VALUE 'KW';
