import {createClient} from 'next-sanity'

function requiredPublicEnvironment(name: 'NEXT_PUBLIC_SANITY_PROJECT_ID' | 'NEXT_PUBLIC_SANITY_DATASET') {
  const value = process.env[name]
  if (!value) throw new Error(`${name} must be configured before using Sanity.`)
  return value
}

/**
 * Read-only Content Lake client. Trama writes only through its separately
 * audited Delta application boundary; never expose a write token here.
 */
export const sanityClient = createClient({
  projectId: requiredPublicEnvironment('NEXT_PUBLIC_SANITY_PROJECT_ID'),
  dataset: requiredPublicEnvironment('NEXT_PUBLIC_SANITY_DATASET'),
  apiVersion: '2026-09-18',
  useCdn: true,
})
