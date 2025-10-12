'use client'

import {
  Container,
  Heading,
  Text,
  useToast,
  Button,
  Box,
  VStack,
  Alert,
  AlertIcon,
  AlertDescription,
  Divider,
  Progress,
  Input,
  FormControl,
  FormLabel,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  HStack,
  Flex,
} from '@chakra-ui/react'
import { useWebAuthn } from '@/context/WebAuthnContext'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from '@/hooks/useTranslation'
import { FiDownload, FiTrash2, FiRefreshCw, FiMoreVertical, FiUpload } from 'react-icons/fi'

interface FileInfo {
  filename: string
  originalName: string
  size: number
  uploadDate: string
  contentType?: string
}

interface UserStorageStats {
  ethereumAddress: string
  fileCount: number
  totalSize: number
  files: FileInfo[]
}

export default function Upload() {
  const { isAuthenticated, user, signMessage } = useWebAuthn()
  const t = useTranslation()
  const toast = useToast()

  // State for file upload
  const [files, setFiles] = useState<FileInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [stats, setStats] = useState<UserStorageStats | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Modal state for confirmation
  const { isOpen, onOpen, onClose } = useDisclosure()
  const [fileToDelete, setFileToDelete] = useState<string | null>(null)

  // Authentication state
  const [isAuthenticating, setIsAuthenticating] = useState(false)

  const API_BASE = process.env.NEXT_PUBLIC_WEBAUTHN_API_URL

  const loadUserFiles = useCallback(async () => {
    if (!user) return

    try {
      setIsLoading(true)
      const response = await fetch(`${API_BASE}/store/stats/${user.ethereumAddress}`)
      const data = await response.json()

      if (data.success) {
        setStats(data.data)
        setFiles(data.data.files || [])
      } else {
        throw new Error(data.message || 'Failed to load files')
      }
    } catch (error: any) {
      console.error('Failed to load files:', error)
      toast({
        title: 'Error Loading Files',
        description: error.message || 'Failed to load your files',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
    } finally {
      setIsLoading(false)
    }
  }, [user, toast, API_BASE])

  useEffect(() => {
    if (isAuthenticated && user) {
      loadUserFiles()
    }
  }, [isAuthenticated, user, loadUserFiles])

  // WebAuthn authentication function using w3pk
  const authenticateWithPasskey = async (): Promise<boolean> => {
    try {
      setIsAuthenticating(true)

      // Use w3pk's signMessage which handles authentication internally
      // We just need to sign a simple authentication message
      const authMessage = `Authenticate for file operation at ${new Date().toISOString()}`
      const signature = await signMessage(authMessage)

      if (!signature) {
        throw new Error('Authentication failed')
      }

      return true
    } catch (error: any) {
      console.error('Authentication failed:', error)
      toast({
        title: 'Authentication Failed',
        description: error.message || 'Failed to authenticate with passkey',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
      return false
    } finally {
      setIsAuthenticating(false)
    }
  }

  // File validation constants
  const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
  const ALLOWED_FILE_TYPES = [
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    // Images
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    // Archives
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    // Video
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/x-msvideo',
    // Audio
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    // Code
    'application/json',
    'application/javascript',
    'text/html',
    'text/css',
  ]

  const validateFile = (file: File): { valid: boolean; error?: string } => {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File size exceeds the maximum limit of ${formatFileSize(MAX_FILE_SIZE)}. Your file is ${formatFileSize(file.size)}.`,
      }
    }

    // Check file type
    if (!ALLOWED_FILE_TYPES.includes(file.type) && file.type !== '') {
      // Get file extension for display
      const extension = file.name.split('.').pop()?.toUpperCase() || 'Unknown'
      return {
        valid: false,
        error: `File type "${extension}" (${file.type}) is not supported. Please upload documents, images, archives, or media files.`,
      }
    }

    // Additional check for suspicious or potentially dangerous files
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.app', '.dmg', '.msi', '.scr']
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'))
    if (dangerousExtensions.includes(fileExtension)) {
      return {
        valid: false,
        error: `Executable files (${fileExtension}) are not allowed for security reasons.`,
      }
    }

    return { valid: true }
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const validation = validateFile(file)

      if (!validation.valid) {
        toast({
          title: 'Invalid File',
          description: validation.error,
          status: 'error',
          duration: 8000,
          isClosable: true,
        })
        // Clear the input
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
        setSelectedFile(null)
        return
      }

      setSelectedFile(file)
      toast({
        title: 'File Selected',
        description: `${file.name} (${formatFileSize(file.size)}) ready to upload`,
        status: 'info',
        duration: 3000,
        isClosable: true,
      })
    }
  }

  const uploadFile = async () => {
    if (!selectedFile || !user) return

    // Double-check validation before upload
    const validation = validateFile(selectedFile)
    if (!validation.valid) {
      toast({
        title: 'Upload Cancelled',
        description: validation.error,
        status: 'error',
        duration: 8000,
        isClosable: true,
      })
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    // Require authentication before upload
    const isAuthenticated = await authenticateWithPasskey()
    if (!isAuthenticated) return

    try {
      setIsLoading(true)
      setUploadProgress(0)

      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('ethereumAddress', user.ethereumAddress)

      // Simulate progress (you might want to implement actual progress tracking)
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90))
      }, 200)

      const response = await fetch(`${API_BASE}/store/upload`, {
        method: 'POST',
        body: formData,
      })

      clearInterval(progressInterval)
      setUploadProgress(100)

      const result = await response.json()

      if (result.success) {
        toast({
          title: 'Upload Successful',
          description: `File "${selectedFile.name}" uploaded successfully`,
          status: 'success',
          duration: 3000,
          isClosable: true,
        })
        setSelectedFile(null)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
        await loadUserFiles() // Reload files
      } else {
        // Handle specific error cases from backend
        if (result.message?.includes('size')) {
          throw new Error(
            `Server rejected file: ${result.message}. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.`
          )
        } else if (result.message?.includes('type') || result.message?.includes('format')) {
          throw new Error(`Server rejected file type: ${result.message}`)
        } else {
          throw new Error(result.message || 'Upload failed')
        }
      }
    } catch (error: any) {
      console.error('Upload failed:', error)

      // Provide more helpful error messages
      let errorMessage = error.message || 'Failed to upload file'

      if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
        errorMessage = 'Network error. Please check your connection and try again.'
      } else if (error.message?.includes('413')) {
        errorMessage = `File too large for server. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.`
      } else if (error.message?.includes('415')) {
        errorMessage = 'File type not supported by server.'
      } else if (error.message?.includes('507')) {
        errorMessage = 'Server storage full. Please contact support.'
      }

      toast({
        title: 'Upload Failed',
        description: errorMessage,
        status: 'error',
        duration: 8000,
        isClosable: true,
      })
    } finally {
      setIsLoading(false)
      setUploadProgress(0)
    }
  }

  const downloadFile = async (filename: string, originalName: string) => {
    if (!user) return

    // Require authentication before download
    const isAuthenticated = await authenticateWithPasskey()
    if (!isAuthenticated) return

    try {
      const response = await fetch(`${API_BASE}/store/download/${user.ethereumAddress}/${filename}`)

      if (!response.ok) {
        throw new Error('Failed to download file')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = originalName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast({
        title: 'Download Started',
        description: `Downloading "${originalName}"`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      })
    } catch (error: any) {
      console.error('Download failed:', error)
      toast({
        title: 'Download Failed',
        description: error.message || 'Failed to download file',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
    }
  }

  const deleteFile = async (filename: string) => {
    if (!user) return

    // Require authentication before delete
    const isAuthenticated = await authenticateWithPasskey()
    if (!isAuthenticated) return

    try {
      const response = await fetch(`${API_BASE}/store/file/${user.ethereumAddress}/${filename}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (result.success) {
        toast({
          title: 'File Deleted',
          description: 'File deleted successfully',
          status: 'success',
          duration: 3000,
          isClosable: true,
        })
        await loadUserFiles() // Reload files
      } else {
        throw new Error(result.message || 'Delete failed')
      }
    } catch (error: any) {
      console.error('Delete failed:', error)
      toast({
        title: 'Delete Failed',
        description: error.message || 'Failed to delete file',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
    }
  }

  const confirmDelete = (filename: string) => {
    setFileToDelete(filename)
    onOpen()
  }

  const handleDelete = () => {
    if (fileToDelete) {
      deleteFile(fileToDelete)
      setFileToDelete(null)
      onClose()
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  if (!isAuthenticated) {
    return (
      <Container maxW="container.sm" py={20}>
        <VStack spacing={8} align="stretch">
          <Box bg="whiteAlpha.50" p={6} borderRadius="md" textAlign="center">
            <Alert status="warning" bg="transparent" color="orange.200">
              <AlertIcon />
              <AlertDescription>
                Please log in to access file upload and management functionality.
              </AlertDescription>
            </Alert>
          </Box>
        </VStack>
      </Container>
    )
  }

  return (
    <Container maxW="container.lg" py={10}>
      <VStack spacing={8} align="stretch">
        <Box textAlign="center">
          <Heading as="h1" size="lg" mb={4}>
            Upload & Manage Files
          </Heading>
          <Text color="gray.400" mb={6}>
            Securely upload and manage your files with WebAuthn authentication
          </Text>
        </Box>

        {/* User Info */}
        <Box bg="gray.800" p={4} borderRadius="md">
          <Text fontSize="sm" color="gray.400" mb={2}>
            Logged in as: <strong>{user?.displayName || user?.username}</strong>
          </Text>
          <Text fontSize="xs" color="gray.500" mb={2}>
            Ethereum Address: {user?.ethereumAddress}
          </Text>
          {stats && (
            <Text fontSize="xs" color="blue.300">
              {stats.fileCount} files • {formatFileSize(stats.totalSize)} total
            </Text>
          )}
          <Text fontSize="xs" color="yellow.300" mt={2}>
            🔐 Passkey authentication required for all file operations
          </Text>
        </Box>

        <Divider />

        {/* Upload Section */}
        <Box bg="gray.800" p={6} borderRadius="md">
          <Heading as="h3" size="md" mb={4}>
            Upload New File
          </Heading>

          <VStack spacing={4} align="stretch">
            <FormControl>
              <FormLabel>Select File</FormLabel>
              <Input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                bg="gray.700"
                border="1px solid"
                borderColor="gray.600"
                _hover={{ borderColor: 'gray.500' }}
                _focus={{ borderColor: '#8c1c84', boxShadow: '0 0 0 1px #8c1c84' }}
                sx={{
                  '::file-selector-button': {
                    bg: '#8c1c84',
                    color: 'white',
                    border: 'none',
                    borderRadius: 'md',
                    px: 4,
                    py: 2,
                    mr: 3,
                    cursor: 'pointer',
                    _hover: {
                      bg: '#6d1566',
                    },
                  },
                }}
              />
            </FormControl>

            {selectedFile && (
              <Box p={3} bg="gray.700" borderRadius="md">
                <HStack justify="space-between">
                  <Box>
                    <Text fontSize="sm" color="gray.300">
                      Selected: {selectedFile.name}
                    </Text>
                    <HStack spacing={2} mt={1}>
                      <Badge colorScheme="blue" size="sm">
                        {formatFileSize(selectedFile.size)}
                      </Badge>
                      <Badge colorScheme="green" size="sm">
                        ✓ Valid
                      </Badge>
                    </HStack>
                  </Box>
                  <IconButton
                    aria-label="Clear selection"
                    icon={<FiTrash2 />}
                    size="sm"
                    variant="ghost"
                    colorScheme="red"
                    onClick={() => {
                      setSelectedFile(null)
                      if (fileInputRef.current) {
                        fileInputRef.current.value = ''
                      }
                    }}
                  />
                </HStack>
              </Box>
            )}

            {uploadProgress > 0 && (
              <Box>
                <Text fontSize="sm" color="gray.400" mb={2}>
                  Upload Progress: {uploadProgress}%
                </Text>
                <Progress value={uploadProgress} colorScheme="purple" />
              </Box>
            )}

            <Button
              leftIcon={<FiUpload />}
              bg="#8c1c84"
              color="white"
              _hover={{ bg: '#6d1566' }}
              onClick={uploadFile}
              isLoading={isLoading || isAuthenticating}
              loadingText={isAuthenticating ? 'Authenticating...' : 'Uploading...'}
              isDisabled={!selectedFile}
              size="lg"
            >
              Upload File
            </Button>
          </VStack>
        </Box>

        {/* Files List */}
        <Box>
          <Flex align="center" justify="space-between" mb={4}>
            <Heading as="h3" size="md">
              Your Files
            </Heading>
            <Button
              leftIcon={<FiRefreshCw />}
              variant="outline"
              size="sm"
              onClick={loadUserFiles}
              isLoading={isLoading}
            >
              Refresh
            </Button>
          </Flex>

          {files.length === 0 ? (
            <Box bg="gray.800" p={6} borderRadius="md" textAlign="center">
              <Text color="gray.400">No files uploaded yet.</Text>
            </Box>
          ) : (
            <>
              {/* Desktop Table View */}
              <Box
                bg="gray.800"
                borderRadius="md"
                overflow="hidden"
                display={{ base: 'none', md: 'block' }}
              >
                <Table variant="simple" size="sm">
                  <Thead>
                    <Tr>
                      <Th>File Name</Th>
                      <Th>Size</Th>
                      <Th>Upload Date</Th>
                      <Th width="100px">Actions</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {files.map(file => (
                      <Tr key={file.filename}>
                        <Td>
                          <Text fontWeight="medium" fontSize="sm">
                            {file.originalName}
                          </Text>
                          <Text fontSize="xs" color="gray.500">
                            {file.filename}
                          </Text>
                        </Td>
                        <Td>
                          <Badge colorScheme="blue" size="sm">
                            {formatFileSize(file.size)}
                          </Badge>
                        </Td>
                        <Td>
                          <Text fontSize="sm">{formatDate(file.uploadDate)}</Text>
                        </Td>
                        <Td>
                          <Menu>
                            <MenuButton
                              as={IconButton}
                              icon={<FiMoreVertical />}
                              variant="ghost"
                              size="sm"
                              isDisabled={isAuthenticating}
                            />
                            <MenuList>
                              <MenuItem
                                icon={<FiDownload />}
                                onClick={() => downloadFile(file.filename, file.originalName)}
                                isDisabled={isAuthenticating}
                              >
                                Download
                              </MenuItem>
                              <MenuItem
                                icon={<FiTrash2 />}
                                color="red.300"
                                onClick={() => confirmDelete(file.filename)}
                                isDisabled={isAuthenticating}
                              >
                                Delete
                              </MenuItem>
                            </MenuList>
                          </Menu>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>

              {/* Mobile Card View */}
              <VStack spacing={3} display={{ base: 'flex', md: 'none' }}>
                {files.map(file => (
                  <Box key={file.filename} bg="gray.800" p={4} borderRadius="md" width="100%">
                    <Flex justify="space-between" align="flex-start" mb={2}>
                      <Box flex="1" mr={3}>
                        <Text fontWeight="medium" fontSize="sm" mb={1}>
                          {file.originalName}
                        </Text>
                        <HStack spacing={2} mb={1}>
                          <Badge colorScheme="blue" size="sm">
                            {formatFileSize(file.size)}
                          </Badge>
                          <Text fontSize="xs" color="gray.500">
                            {formatDate(file.uploadDate)}
                          </Text>
                        </HStack>
                        <Text fontSize="xs" color="gray.500">
                          {file.filename}
                        </Text>
                      </Box>
                      <Menu>
                        <MenuButton
                          as={IconButton}
                          icon={<FiMoreVertical />}
                          variant="ghost"
                          size="sm"
                          isDisabled={isAuthenticating}
                        />
                        <MenuList>
                          <MenuItem
                            icon={<FiDownload />}
                            onClick={() => downloadFile(file.filename, file.originalName)}
                            isDisabled={isAuthenticating}
                          >
                            Download
                          </MenuItem>
                          <MenuItem
                            icon={<FiTrash2 />}
                            color="red.300"
                            onClick={() => confirmDelete(file.filename)}
                            isDisabled={isAuthenticating}
                          >
                            Delete
                          </MenuItem>
                        </MenuList>
                      </Menu>
                    </Flex>
                  </Box>
                ))}
              </VStack>
            </>
          )}
        </Box>

        {/* Info Box */}
        <Box bg="gray.800" p={4} borderRadius="md">
          <Text fontSize="sm" color="gray.400" mb={2}>
            <strong>File Storage Information:</strong>
          </Text>
          <Text fontSize="xs" color="gray.500" mb={2}>
            Your files are securely stored and associated with your WebAuthn-authenticated account.
            Only you can access, download, or delete your files.
          </Text>
          <Text fontSize="xs" color="gray.500" mb={2}>
            <strong>Limits:</strong> Maximum file size: {formatFileSize(MAX_FILE_SIZE)} per file
          </Text>
          <Text fontSize="xs" color="gray.500" mb={3}>
            <strong>Supported formats:</strong> Documents (PDF, Word, Excel), Images (JPG, PNG, GIF,
            WebP, SVG), Archives (ZIP, RAR, 7Z), Video (MP4, MOV), Audio (MP3, WAV), Code files
            (JSON, JS, HTML, CSS)
          </Text>
          <Text fontSize="xs" color="yellow.300">
            🔐 Security Note: All file operations (upload, download, delete) require fresh passkey
            authentication powered by w3pk SDK for maximum security.
          </Text>
        </Box>
      </VStack>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay bg="blackAlpha.600" />
        <ModalContent bg="gray.800" color="white">
          <ModalHeader>Confirm Delete</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text>Are you sure you want to delete this file? This action cannot be undone.</Text>
            <Text fontSize="sm" color="yellow.300" mt={2}>
              You will need to authenticate with your passkey to confirm deletion.
            </Text>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onClose}>
              Cancel
            </Button>
            <Button colorScheme="red" onClick={handleDelete}>
              Delete File
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Container>
  )
}
