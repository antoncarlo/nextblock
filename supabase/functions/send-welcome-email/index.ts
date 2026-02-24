import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, fullName } = await req.json();

    if (!email || !fullName) {
      return new Response(
        JSON.stringify({ error: 'email and fullName are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const firstName = fullName.trim().split(' ')[0] || fullName;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'NextBlock <info@nextblock.finance>',
        to: [email],
        subject: 'Thank you for your interest in NextBlock',
        html: `
          <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1A1F2E; background-color: #ffffff;">
            <!-- Logo -->
            <div style="text-align: center; padding: 40px 20px 24px;">
              <img src="https://landing-whisper-wave.lovable.app/images/email-logo.png" alt="NextBlock" style="height: 200px; width: auto;" />
            </div>

            <!-- Body -->
            <div style="padding: 0 32px 32px;">
              <p style="font-size: 16px; line-height: 1.6;">Hi ${firstName},</p>
              <p style="font-size: 16px; line-height: 1.6;">
                Thank you for reaching out.
              </p>
              <p style="font-size: 16px; line-height: 1.6;">
                We're building institutional infrastructure for the largest untokenized real-world asset class — insurance. You'll receive updates on protocol development, milestones, and early access opportunities as we approach launch.
              </p>
              <p style="font-size: 16px; line-height: 1.6;">
                If you'd like to explore a partnership, integration, or institutional collaboration, feel free to contact us directly at <a href="mailto:nextblock@financier.com" style="color: #1B3A6B;">nextblock@financier.com</a>.
              </p>
              <p style="font-size: 16px; line-height: 1.6;">
                More soon.
              </p>
              <p style="font-size: 16px; line-height: 1.6; margin-top: 32px;">
                <strong>NextBlock Team</strong><br/>
                <a href="https://nextblock.finance" style="color: #1B3A6B;">nextblock.finance</a>
              </p>
            </div>

            <!-- Footer Image -->
            <div style="width: 100%;">
              <img src="https://landing-whisper-wave.lovable.app/images/email-footer.png" alt="" style="width: 100%; height: auto; display: block;" />
            </div>

            <!-- Social Links -->
            <div style="background-color: #f8f8f8; padding: 24px 32px; text-align: center;">
              <div style="margin-bottom: 16px;">
                <a href="https://x.com/NBlock2040" style="color: #1B3A6B; text-decoration: none; margin: 0 12px; font-size: 14px;">X (Twitter)</a>
                <a href="https://www.linkedin.com/company/next-block" style="color: #1B3A6B; text-decoration: none; margin: 0 12px; font-size: 14px;">LinkedIn</a>
                <a href="mailto:nextblock@financier.com" style="color: #1B3A6B; text-decoration: none; margin: 0 12px; font-size: 14px;">Email</a>
                <a href="https://github.com/alessandromaci/nextblock" style="color: #1B3A6B; text-decoration: none; margin: 0 12px; font-size: 14px;">GitHub</a>
              </div>
              <p style="font-size: 12px; color: #8A8A8A; margin: 0;">
                NextBlock &mdash; The Universal Marketplace for Insurance-Linked Assets<br/>
                <a href="https://nextblock.finance" style="color: #1B3A6B;">nextblock.finance</a>
              </p>
            </div>
          </div>
        `,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('Resend error:', JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: data.message || 'Failed to send email' }),
        { status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});