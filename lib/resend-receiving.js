export async function fetchReceivedEmail(emailId) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;

  const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    console.error("[inbound email] Resend API error", res.status, await res.text());
    return null;
  }

  const data = await res.json();
  if (!data.from || !data.to?.length) return null;

  return {
    from: data.from,
    to: data.to,
    subject: data.subject?.trim() || null,
    text: data.text ?? null,
    html: data.html ?? null,
  };
}
