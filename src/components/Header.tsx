'use client'

import {
  Box,
  Button,
  Flex,
  Heading,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  IconButton,
  Text,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  Input,
  FormControl,
  FormLabel,
  VStack,
} from '@chakra-ui/react'
import Link from 'next/link'
import { HamburgerIcon } from '@chakra-ui/icons'
import LanguageSelector from './LanguageSelector'
import { useTranslation } from '@/hooks/useTranslation'
import { useWebAuthn } from '@/context/WebAuthnContext'
import { useState, useEffect } from 'react'
import { FaGithub } from 'react-icons/fa'

export default function Header() {
  const { isAuthenticated, user, isLoading, login, register, logout } = useWebAuthn()
  const t = useTranslation()
  const { isOpen, onOpen, onClose } = useDisclosure()
  const [username, setUsername] = useState('')
  const [isRegistering, setIsRegistering] = useState(false)

  const [scrollPosition, setScrollPosition] = useState(0)

  const shouldSlide = scrollPosition > 0
  const leftSlideValue = shouldSlide ? 2000 : 0
  const rightSlideValue = shouldSlide ? 2000 : 0

  const GitHubIcon = FaGithub

  useEffect(() => {
    const handleScroll = () => {
      setScrollPosition(window.scrollY)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleLogin = async () => {
    await login()
  }

  const handleRegister = async () => {
    if (!username.trim()) {
      return
    }

    try {
      setIsRegistering(true)
      await register(username.trim())
      setUsername('')
      onClose()
    } catch (error) {
      console.error('Registration failed:', error)
    } finally {
      setIsRegistering(false)
    }
  }

  const handleLogout = () => {
    logout()
  }

  const handleModalClose = () => {
    setUsername('')
    onClose()
  }

  return (
    <>
      <Box as="header" py={4} position="fixed" w="100%" top={0} zIndex={10}>
        <Flex justify="space-between" align="center" px={4}>
          <Box
            transform={`translateX(-${leftSlideValue}px)`}
            transition="transform 0.5s ease-in-out"
          >
            <Flex align="center" gap={3}>
              <Link href="/">
                <Heading as="h3" size="md" textAlign="center">
                  Stealth Gov
                </Heading>
              </Link>
            </Flex>
          </Box>

          <Flex
            gap={2}
            align="center"
            transform={`translateX(${rightSlideValue}px)`}
            transition="transform 0.5s ease-in-out"
          >
            {!isAuthenticated ? (
              <Flex align="center" gap={3}>
                <Text
                  fontSize="sm"
                  color="gray.300"
                  cursor="pointer"
                  _hover={{ color: 'white', textDecoration: 'underline' }}
                  onClick={onOpen}
                >
                  Register
                </Text>
                <Button
                  bg="#8c1c84"
                  color="white"
                  _hover={{
                    bg: '#6d1566',
                  }}
                  onClick={handleLogin}
                  isLoading={isLoading}
                  loadingText="Authenticating..."
                  size="sm"
                >
                  {t.common.login}
                </Button>
              </Flex>
            ) : (
              <>
                <Box>
                  <Text fontSize="sm" color="gray.300">
                    {user?.displayName || user?.username}
                  </Text>
                </Box>
                <Button
                  bg="#8c1c84"
                  color="white"
                  _hover={{
                    bg: '#6d1566',
                  }}
                  onClick={handleLogout}
                  size="sm"
                  ml={4}
                >
                  {t.common.logout}
                </Button>
              </>
            )}
            <Menu>
              <MenuButton
                as={IconButton}
                aria-label="Options"
                icon={<HamburgerIcon />}
                variant="ghost"
                size="sm"
              />
              <MenuList minWidth="180px" px={2}>
                <Link href="/voting" color="white">
                  <MenuItem fontSize="md" px={4} py={3}>
                    Voting
                  </MenuItem>
                </Link>

                <Link href="/web3" color="white">
                  <MenuItem fontSize="md" px={4} py={3}>
                    Sign a message
                  </MenuItem>
                </Link>
                <Link href="/test" color="white">
                  <MenuItem fontSize="md" px={4} py={3}>
                    Test
                  </MenuItem>
                </Link>
                <Link href="/upload" color="white">
                  <MenuItem fontSize="md" px={4} py={3}>
                    Upload files
                  </MenuItem>
                </Link>
              </MenuList>
            </Menu>
            <LanguageSelector />
          </Flex>
        </Flex>
      </Box>

      {/* Registration Modal */}
      <Modal isOpen={isOpen} onClose={handleModalClose} isCentered>
        <ModalOverlay bg="blackAlpha.600" />
        <ModalContent bg="gray.800" color="white">
          <ModalHeader>Register New Account</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <Text fontSize="sm" color="gray.400" textAlign="center">
                Create a new account with WebAuthn passkey authentication. An Ethereum wallet will
                be generated automatically.
              </Text>
              <FormControl>
                <FormLabel>Username</FormLabel>
                <Input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  bg="gray.700"
                  border="1px solid"
                  borderColor="gray.600"
                  _hover={{ borderColor: 'gray.500' }}
                  _focus={{ borderColor: '#8c1c84', boxShadow: '0 0 0 1px #8c1c84' }}
                  onKeyPress={e => {
                    if (e.key === 'Enter' && username.trim()) {
                      handleRegister()
                    }
                  }}
                />
              </FormControl>
            </VStack>
          </ModalBody>

          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={handleModalClose}>
              Cancel
            </Button>
            <Button
              bg="#8c1c84"
              color="white"
              _hover={{ bg: '#6d1566' }}
              onClick={handleRegister}
              isLoading={isRegistering}
              loadingText="Creating..."
              isDisabled={!username.trim()}
            >
              Create Account
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}
