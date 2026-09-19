import { describe, it, expect } from "vitest"
import { getPageTitle } from "@/config/pageTitles"

describe("getPageTitle", () => {
    it("usa 'Análise de propriedades' na lista de /propriedades", () => {
        expect(getPageTitle("/propriedades")).toEqual({
            kicker: "Suas unidades",
            title: "Análise de propriedades",
        })
    })

    it.each([
        ["/propriedades/prop-1", "Detalhe da propriedade"],
        ["/propriedades/prop-1/areas/area-1", "Detalhe da área"],
        ["/propriedades/prop-1/areas/area-1/devices/dev-1", "Detalhe do dispositivo"],
    ])("mantém o título do nível aninhado em %s", (pathname, title) => {
        expect(getPageTitle(pathname)).toEqual({ kicker: "Suas unidades", title })
    })

    it("usa 'Configurações / Cadastro' em /configuracoes/cadastro", () => {
        expect(getPageTitle("/configuracoes/cadastro")).toEqual({
            kicker: "Configurações",
            title: "Cadastro",
        })
    })

    it("usa o kicker 'LumiTrack' em /sobre", () => {
        expect(getPageTitle("/sobre")).toEqual({ kicker: "LumiTrack", title: "Sobre o projeto" })
    })

    it("não tem mais título próprio para /simulacao — cai no fallback", () => {
        expect(getPageTitle("/simulacao")).toEqual({ kicker: "LumiTrack", title: "Painel" })
    })

    it("mantém os títulos das demais rotas do app", () => {
        expect(getPageTitle("/dashboard").title).toBe("Painel")
        expect(getPageTitle("/relatorios").title).toBe("Relatórios")
        expect(getPageTitle("/alertas").title).toBe("Alertas")
        expect(getPageTitle("/distribuidoras").title).toBe("Distribuidoras")
        expect(getPageTitle("/perfil")).toEqual({ kicker: "Conta", title: "Perfil" })
        expect(getPageTitle("/seguranca")).toEqual({ kicker: "Conta", title: "Segurança" })
    })
})
