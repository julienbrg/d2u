'use client'

import { type ReactNode, memo } from 'react'
import { ChakraProvider, extendTheme } from '@chakra-ui/react'
import { WebAuthnProvider } from './WebAuthnContext'

const theme = extendTheme({
  config: {
    initialColorMode: 'dark',
    useSystemColorMode: false,
  },
  styles: {
    global: {
      body: {
        bg: '#000000',
        color: 'white',
      },
    },
  },
})

const ContextProvider = memo(function ContextProvider({ children }: { children: ReactNode }) {
  return (
    <ChakraProvider theme={theme}>
      <WebAuthnProvider>{children}</WebAuthnProvider>
    </ChakraProvider>
  )
})

export default ContextProvider
