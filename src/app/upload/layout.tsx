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
  Spacer,
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
  const { isAuthenticated, user } = useWebAuthn()
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
  }, [user, toast])

  useEffect(() => {
    if (isAuthenticated && user) {
      loadUserFiles()
    }
  }, [isAuthenticated, user, loadUserFiles])

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
    }
  }

  const uploadFile = async () => {
    if (!selectedFile || !user) return

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
        throw new Error(result.message || 'Upload failed')
      }
    } catch (error: any) {
      console.error('Upload failed:', error)
      toast({
        title: 'Upload Failed',
        description: error.message || 'Failed to upload file',
        status: 'error',
        duration: 5000,
        isClosable: true,
      })
    } finally {
      setIsLoading(false)
      setUploadProgress(0)
    }
  }

  const downloadFile = async (filename: string, originalName: string) => {
    if (!user) return

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
                <Text fontSize="sm" color="gray.300">
                  Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                </Text>
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
              isLoading={isLoading}
              loadingText="Uploading..."
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
                            />
                            <MenuList>
                              <MenuItem
                                icon={<FiDownload />}
                                onClick={() => downloadFile(file.filename, file.originalName)}
                              >
                                Download
                              </MenuItem>
                              <MenuItem
                                icon={<FiTrash2 />}
                                color="red.300"
                                onClick={() => confirmDelete(file.filename)}
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
                        />
                        <MenuList>
                          <MenuItem
                            icon={<FiDownload />}
                            onClick={() => downloadFile(file.filename, file.originalName)}
                          >
                            Download
                          </MenuItem>
                          <MenuItem
                            icon={<FiTrash2 />}
                            color="red.300"
                            onClick={() => confirmDelete(file.filename)}
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
          <Text fontSize="xs" color="gray.500" mb={3}>
            Your files are securely stored and associated with your WebAuthn-authenticated account.
            Only you can access, download, or delete your files.
          </Text>
          <Text fontSize="xs" color="yellow.300">
            Security Note: Files are stored on the server and protected by your WebAuthn
            authentication. Make sure to keep backups of important files.
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
