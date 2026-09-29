import { createContext, useContext, useMemo, type ReactNode } from 'react'
import {
  AnimatedToastStack,
  useAnimatedToastStack,
  type ToastInput,
} from '@/components/motion/animated-toast-stack'

interface ToastApi {
  success: (title: ReactNode, description?: ReactNode) => void
  error: (title: ReactNode, description?: ReactNode) => void
  info: (title: ReactNode, description?: ReactNode) => void
}

const ToastContext = createContext<ToastApi | null>(null)

// One stack for the whole app (animated-toast-stack from beUI): success/error/info
// messages that stack, can be swiped away, and clear themselves.
export function ToastProvider({ children }: { children: ReactNode }) {
  const { toasts, showToast, dismissToast } = useAnimatedToastStack({ defaultDuration: 4000, limit: 4 })

  const api = useMemo<ToastApi>(() => {
    const show = (status: ToastInput['status']) => (title: ReactNode, description?: ReactNode) => {
      showToast({ status, title, description })
    }
    return { success: show('success'), error: show('error'), info: show('info') }
  }, [showToast])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <AnimatedToastStack toasts={toasts} onDismiss={dismissToast} position="bottom-center" placement="fixed" maxVisible={3} />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside <ToastProvider>')
  return api
}
