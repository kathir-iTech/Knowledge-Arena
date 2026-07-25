"use client"

import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  iconMap,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant = "default", ...props }) {
        const Icon = iconMap[variant as keyof typeof iconMap]
        const isDestructive = variant === "destructive"
        return (
          <Toast key={id} variant={variant} role={isDestructive ? "alert" : "status"} aria-live={isDestructive ? "assertive" : "polite"} {...props}>
            <div className="flex gap-3 w-full min-w-0">
              {Icon && (
                <div className="shrink-0 mt-0.5" aria-hidden="true">
                  <Icon className="h-4 w-4" />
                </div>
              )}
              <div className="grid gap-0.5 flex-1 min-w-0">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose aria-label="Dismiss notification" />
          </Toast>
        )
      })}
      <ToastViewport aria-live="polite" aria-label="Notifications" />
    </ToastProvider>
  )
}
