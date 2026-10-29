import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

function page(status: number, title: string, message: string): Response {
  const html = `
      <body style="font-family: sans-serif; text-align: center; padding: 50px; color: #4f111c; background: #F4F1E1;">
        <h2>${title}</h2>
        <p>${message}</p>
      </body>
    `
  return new Response(html, { status, headers: { "Content-Type": "text/html" } })
}

function fromB64url(s: string): Uint8Array | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  } catch {
    return null
  }
}

// Checks the link's token (HMAC-SHA256 of the email) in constant time.
async function tokenIsValid(email: string, token: string, secret: string): Promise<boolean> {
  const sig = fromB64url(token)
  if (!sig || !secret) return false
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"])
  return await crypto.subtle.verify("HMAC", key, sig, enc.encode("unsubscribe:v1:" + email))
}

serve(async (req) => {
  const url = new URL(req.url)
  const email = url.searchParams.get('email')
  const token = url.searchParams.get('token')

  if (!email) return new Response("No email provided.", { status: 400 })

  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!token || !(await tokenIsValid(email, token, secret))) {
    return page(403, "Invalid Unsubscribe Link", "This unsubscribe link is not valid. Please use the link from your most recent email.")
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      secret
    )

    const { error } = await supabaseAdmin
      .from('subscribers')
      .update({ status: 'Unsubscribed' })
      .eq('email', email)

    if (error) throw error

    return page(200, "Successfully Unsubscribed", "You will no longer receive updates from Cotuit Kettleers Baseball.")
  } catch (err) {
    return new Response("Error processing request.", { status: 500 })
  }
})
