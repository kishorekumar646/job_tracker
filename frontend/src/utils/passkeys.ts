// Author: Kishore Kumar
import { apiClient, errorMessage } from '../api/client'
import type { AuthResponse } from '../types'

type JsonDescriptor = Omit<PublicKeyCredentialDescriptor, 'id'> & { id: string }
type RegistrationOptions = Omit<PublicKeyCredentialCreationOptions, 'challenge' | 'user' | 'excludeCredentials'> & {
  challenge: string
  user: Omit<PublicKeyCredentialUserEntity, 'id'> & { id: string }
  excludeCredentials?: JsonDescriptor[]
}
type LoginOptions = Omit<PublicKeyCredentialRequestOptions, 'challenge' | 'allowCredentials'> & {
  challenge: string
  allowCredentials?: JsonDescriptor[]
}

export interface DevicePasskey { id: number; name: string; created_at: string }

const decode = (value: string): ArrayBuffer =>
  Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)).buffer
const encode = (value: ArrayBuffer): string =>
  btoa(Array.from(new Uint8Array(value), (b) => String.fromCharCode(b)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const descriptor = (value: JsonDescriptor): PublicKeyCredentialDescriptor => ({ ...value, id: decode(value.id) })

export const PASSKEY_DEFAULT_KEY = 'jobpilot_device_login_default'

export function passkeyPreferred(): boolean {
  return localStorage.getItem(PASSKEY_DEFAULT_KEY) === 'true'
}

export function setPasskeyPreferred(value: boolean) {
  localStorage.setItem(PASSKEY_DEFAULT_KEY, String(value))
}

export async function platformPasskeyAvailable(): Promise<boolean> {
  return window.isSecureContext && typeof PublicKeyCredential !== 'undefined'
    && typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
    && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
}

export function passkeyError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'AbortError') return 'Device verification was cancelled or timed out. Try again or use your authenticator code.'
    if (error.name === 'InvalidStateError') return 'This device already has a passkey for this account.'
    if (error.name === 'SecurityError') return 'Device sign-in is unavailable on this domain. Use HTTPS and check the server passkey configuration.'
  }
  return errorMessage(error, error instanceof Error ? error.message : 'Device sign-in failed. Please try again.')
}

export const passkeysApi = {
  list: () => apiClient.get<DevicePasskey[]>('/auth/passkeys').then((r) => r.data),
  remove: (id: number, otp: string) => apiClient.delete(`/auth/passkeys/${id}`, { data: { otp } }),
  register: async (otp: string, name: string): Promise<DevicePasskey> => {
    const { data: options } = await apiClient.post<RegistrationOptions>('/auth/passkeys/register/options', { otp })
    const credential = await navigator.credentials.create({ publicKey: {
      ...options, challenge: decode(options.challenge),
      user: { ...options.user, id: decode(options.user.id) },
      excludeCredentials: options.excludeCredentials?.map(descriptor),
    } })
    if (!(credential instanceof PublicKeyCredential) || !(credential.response instanceof AuthenticatorAttestationResponse)) {
      throw new Error('The device did not return a passkey. Please try again.')
    }
    return apiClient.post<DevicePasskey>('/auth/passkeys/register/verify', {
      challenge: options.challenge, name,
      credential: {
        id: credential.id, rawId: encode(credential.rawId), type: credential.type,
        authenticatorAttachment: credential.authenticatorAttachment,
        clientExtensionResults: credential.getClientExtensionResults(),
        response: {
          clientDataJSON: encode(credential.response.clientDataJSON),
          attestationObject: encode(credential.response.attestationObject),
          transports: credential.response.getTransports?.() ?? [],
        },
      },
    }).then((r) => r.data)
  },
  login: async (): Promise<AuthResponse> => {
    const { data: options } = await apiClient.post<LoginOptions>('/auth/passkeys/login/options')
    const credential = await navigator.credentials.get({ publicKey: {
      ...options, challenge: decode(options.challenge),
      allowCredentials: options.allowCredentials?.map(descriptor),
    } })
    if (!(credential instanceof PublicKeyCredential) || !(credential.response instanceof AuthenticatorAssertionResponse)) {
      throw new Error('The device did not return a passkey. Use your authenticator code.')
    }
    return apiClient.post<AuthResponse>('/auth/passkeys/login/verify', {
      challenge: options.challenge,
      credential: {
        id: credential.id, rawId: encode(credential.rawId), type: credential.type,
        authenticatorAttachment: credential.authenticatorAttachment,
        clientExtensionResults: credential.getClientExtensionResults(),
        response: {
          clientDataJSON: encode(credential.response.clientDataJSON),
          authenticatorData: encode(credential.response.authenticatorData),
          signature: encode(credential.response.signature),
          userHandle: credential.response.userHandle ? encode(credential.response.userHandle) : null,
        },
      },
    }).then((r) => r.data)
  },
}
