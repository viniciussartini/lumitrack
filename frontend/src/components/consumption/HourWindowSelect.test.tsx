import { describe, it, expect, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { render, screen } from "@/tests/test-utils"
import { HourWindowSelect } from "@/components/consumption/HourWindowSelect"

describe("HourWindowSelect", () => {
    it("oferece uma opção por hora, de 0h-1h até a janela da hora corrente", () => {
        render(<HourWindowSelect value={20} onChange={vi.fn()} currentHour={20} />)

        const select = screen.getByTestId("hour-window-select")
        const options = select.querySelectorAll("option")

        expect(options).toHaveLength(21)
        expect(options[0]).toHaveTextContent("0h - 1h")
        expect(options[20]).toHaveTextContent("20h - 21h")
    })

    it("não oferece horas futuras", () => {
        render(<HourWindowSelect value={5} onChange={vi.fn()} currentHour={5} />)

        expect(screen.queryByText("6h - 7h")).not.toBeInTheDocument()
    })

    it("chama onChange com o número da hora escolhida", async () => {
        const onChange = vi.fn()
        const user = userEvent.setup()
        render(<HourWindowSelect value={20} onChange={onChange} currentHour={20} />)

        await user.selectOptions(screen.getByTestId("hour-window-select"), "14h - 15h")

        expect(onChange).toHaveBeenCalledWith(14)
    })
})
