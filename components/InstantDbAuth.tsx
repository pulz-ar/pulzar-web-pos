'use client'

import { useEffect } from 'react'
import { useAuth } from '@clerk/nextjs'
import { init } from '@instantdb/core'

export const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID || 'default_app_id',
  devtool: false,
})

export function InstantDbAuth() {
  const { getToken } = useAuth()

  async function signInToInstantWithClerkToken() {
    try {
      const idToken = await getToken()
      if (!idToken) return

      await db.auth.signInWithIdToken({
        clientName: 'clerk',
        idToken,
      })
    } catch (error) {
      console.error('Error signing in to Instant:', error)
    }
  }

  useEffect(() => {
    signInToInstantWithClerkToken()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}


