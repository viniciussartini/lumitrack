// ─────────────────────────────────────────────────────────────────────────────
// Declaração de módulo para `ethernet-ip`
//
// A lib `ethernet-ip` não possui tipos TypeScript nativos nem um pacote
// @types/ethernet-ip no DefinitelyTyped. Este arquivo declara o módulo
// manualmente para o TypeScript parar de reclamar e aceitar a importação.
//
// Tipamos apenas o subconjunto que realmente usamos (Controller) — o restante
// fica como `unknown` para não mentir sobre a API completa da lib.
//
// Se a lib evoluir e ganhar tipos oficiais, basta deletar este arquivo e
// instalar o pacote de tipos — o restante do código não precisa mudar.
// ─────────────────────────────────────────────────────────────────────────────

declare module "ethernet-ip" {
    export class Controller {
        /**
         * Conecta ao PLC via EtherNet/IP.
         * @param host endereço IP ou hostname do PLC
         * @param slot slot da CPU (padrão 0 para CLX, 1 para outros)
         */
        connect(host: string, slot?: number): Promise<void>

        /**
         * Lê o valor de uma tag CIP do PLC.
         * @param tag nome da tag, ex: "Motor.Speed"
         */
        readTag(tag: string): Promise<{ value: unknown }>

        /** Encerra a conexão e libera o socket. */
        destroy(): void
    }
}