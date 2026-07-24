import type { Meta, StoryObj } from "@storybook/react-vite"
import { Input, Label } from "./Input"

const meta = {
  title: "UI/Input",
  component: Input,
  tags: ["autodocs"],
} satisfies Meta<typeof Input>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { placeholder: "C… (Soroban token contract)" },
}

export const WithValue: Story = {
  args: { defaultValue: "CBFCKEOQRQIXKLGU4QBUQVOINOKFBOXJ37LXEKLKNUO6TW4FNGDU26AW" },
}

export const Disabled: Story = {
  args: { placeholder: "Not editable", disabled: true },
}

export const NumberInput: Story = {
  args: { type: "number", inputMode: "decimal", min: "0", step: "any", placeholder: "0.00" },
}

export const WithLabel: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-2">
      <Label htmlFor="story-token">Token contract address</Label>
      <Input id="story-token" placeholder="C… (Soroban token contract)" />
    </div>
  ),
}

/** The app has no built-in error prop on Input — invalid state is signalled by overriding the border/ring via className, as done for form-level errors elsewhere. */
export const InvalidState: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-2">
      <Label htmlFor="story-invalid">Beneficiary</Label>
      <Input
        id="story-invalid"
        defaultValue="not-a-valid-address"
        aria-invalid="true"
        className="border-destructive/60 focus-visible:ring-destructive"
      />
      <p className="text-xs text-destructive">Enter a valid Stellar address.</p>
    </div>
  ),
}
