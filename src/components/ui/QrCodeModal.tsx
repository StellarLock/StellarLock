import { useRef, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { useModalFocusTrap } from "@/lib/modalFocusTrap"
import { QRCodeCanvas } from "qrcode.react"
import { X, Download, Copy, Check } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/Button"
import { createPortal } from "react-dom"

interface QrCodeModalProps {
  /** The URL to encode in the QR code */
  url: string
  /** Human-readable title shown above the QR code */
  title?: string
  onClose: () => void
}

const QR_SIZE = 256

export function QrCodeModal({ url, title = "Share Lock", onClose }: QrCodeModalProps) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  useModalFocusTrap({ active: true, containerRef, onEscape: onClose })

  /** Download the rendered QR code canvas as a PNG. */
  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current?.querySelector("canvas")
    if (!canvas) return

    // Create a larger canvas with padding and branding
    const padding = 24
    const brandingHeight = 40
    const out = document.createElement("canvas")
    const totalSize = QR_SIZE + padding * 2
    out.width = totalSize
    out.height = totalSize + brandingHeight
    const ctx = out.getContext("2d")
    if (!ctx) return

    // White background
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, out.width, out.height)

    // Draw QR code
    ctx.drawImage(canvas, padding, padding, QR_SIZE, QR_SIZE)

    // Branding footer
    ctx.fillStyle = "#6b7280"
    ctx.font = "14px system-ui, sans-serif"
    ctx.textAlign = "center"
    ctx.fillText("StellarLock", out.width / 2, totalSize + brandingHeight / 2 + 5)

    const link = document.createElement("a")
    link.download = "stellarlock-qr.png"
    link.href = out.toDataURL("image/png")
    link.click()
  }, [])

  /** Copy the URL to clipboard. */
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API may be unavailable in some environments
    }
  }, [url])

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("qrCode.shareAria")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={containerRef} className="flex w-full max-w-sm flex-col rounded-xl bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label={t("qrCode.closeAria")}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            autoFocus
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* QR code */}
        <div className="flex flex-col items-center gap-4 p-6">
          <div ref={canvasRef} className="flex items-center justify-center rounded-xl bg-white p-4 shadow-inner">
            <QRCodeCanvas
              value={url}
              size={QR_SIZE}
              level="M"
              includeMargin
              imageSettings={{
                src: "/icon.svg",
                width: 40,
                height: 40,
                excavate: true,
              }}
            />
          </div>

          <p className="max-w-[256px] break-all text-center text-xs text-muted-foreground">{url}</p>

          <div className="flex w-full gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => void handleCopy()}
              aria-label={t("qrCode.copyUrlAria")}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-green-500" />
                  {t("qrCode.copied")}
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  {t("qrCode.copyUrl")}
                </>
              )}
            </Button>
            <Button className="flex-1" onClick={handleDownload} aria-label={t("qrCode.downloadAria")}>
              <Download className="h-4 w-4" />
              {t("qrCode.downloadPng")}
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            {t("qrCode.scanHint")}
          </p>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
