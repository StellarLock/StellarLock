import type { Meta, StoryObj } from "@storybook/react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./Card"
import { Button } from "./Button"

const meta = {
  title: "UI/Card",
  component: Card,
  tags: ["autodocs"],
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

export const Basic: Story = {
  render: () => (
    <Card className="w-80 p-5">
      <p className="text-sm text-muted-foreground">A bare card is just a bordered, rounded container.</p>
    </Card>
  ),
}

export const WithHeaderAndContent: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>GLOW Token Lock</CardTitle>
        <CardDescription>Locked until Dec 31, 2026</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">1,250,000 GLOW</p>
      </CardContent>
    </Card>
  ),
}

export const WithFooterActions: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Withdraw available</CardTitle>
        <CardDescription>This lock has reached its unlock date.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">500,000 GLOW</p>
      </CardContent>
      <CardFooter>
        <Button className="w-full">Withdraw tokens</Button>
      </CardFooter>
    </Card>
  ),
}
