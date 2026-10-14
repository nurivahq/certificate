
export default async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const adminPassword = process.env.CERTIFICATE_ADMIN_PASSWORD;

  if (!supabaseUrl || !secretKey || !adminPassword) {
    return res.status(500).json({
      error: "Server configuration is incomplete."
    });
  }

  const baseUrl = supabaseUrl.replace(/\/+$/, "");
  const tableUrl = `${baseUrl}/rest/v1/certificates`;

  const headers = {
    apikey: secretKey,
    "Content-Type": "application/json"
  };

  // Retrieve a certificate for QR verification.
  if (req.method === "GET") {
    const id = String(req.query?.id || "");

    if (!/^LW-\d{4}-[A-Z0-9]{6}$/.test(id)) {
      return res.status(400).json({
        error: "Invalid certificate ID."
      });
    }

    try {
      const response = await fetch(
        `${tableUrl}?id=eq.${encodeURIComponent(id)}&select=id,name,certificate_date,scores,logo,photo,issued_at,status`,
        { headers, cache: "no-store" }
      );

      if (!response.ok) {
        return res.status(502).json({
          error: "Could not verify the certificate."
        });
      }

      const rows = await response.json();

      if (!rows.length) {
        return res.status(404).json({
          error: "Certificate not found."
        });
      }

      const row = rows[0];

      return res.status(200).json({
        id: row.id,
        name: row.name,
        date: row.certificate_date,
        scores: row.scores,
        logo: row.logo,
        photo: row.photo,
        issuedAt: row.issued_at,
        status: row.status
      });
    } catch {
      return res.status(500).json({
        error: "Certificate verification failed."
      });
    }
  }

  // Save a certificate. Only the administrator can do this.
  if (req.method === "POST") {
    const { adminPassword: suppliedPassword, record } = req.body || {};

    if (
      typeof suppliedPassword !== "string" ||
      suppliedPassword !== adminPassword
    ) {
      return res.status(401).json({
        error: "Incorrect administrator password."
      });
    }

    if (!record || typeof record !== "object") {
      return res.status(400).json({
        error: "Certificate data is missing."
      });
    }

    const id = String(record.id || "");
    const name = String(record.name || "").trim();
    const date = String(record.date || "");
    const scores = record.scores;

    if (!/^LW-\d{4}-[A-Z0-9]{6}$/.test(id)) {
      return res.status(400).json({
        error: "Invalid certificate ID."
      });
    }

    if (!name || name.length > 150) {
      return res.status(400).json({
        error: "Enter a valid student name."
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
      return res.status(400).json({
        error: "Enter a valid certificate date."
      });
    }

    const expectedTotals = { A1: 20, A2: 20, B1: 29 };

    for (const [level, total] of Object.entries(expectedTotals)) {
      const item = scores?.[level];

      if (
        !item ||
        Number(item.total) !== total ||
        !Number.isInteger(Number(item.score)) ||
        Number(item.score) < 0 ||
        Number(item.score) > total
      ) {
        return res.status(400).json({
          error: `Invalid ${level} score.`
        });
      }
    }

    const payload = {
      id,
      name,
      certificate_date: date,
      scores,
      logo: typeof record.logo === "string" ? record.logo : null,
      photo: typeof record.photo === "string" ? record.photo : null,
      status: "valid"
    };

    try {
      const response = await fetch(
        `${tableUrl}?on_conflict=id`,
        {
          method: "POST",
          headers: {
            ...headers,
            Prefer: "resolution=merge-duplicates,return=minimal"
          },
          body: JSON.stringify(payload)
        }
      );

      if (!response.ok) {
        return res.status(502).json({
          error: "Supabase could not save the certificate."
        });
      }

      return res.status(200).json({
        success: true,
        id
      });
    } catch {
      return res.status(500).json({
        error: "Could not save the certificate."
      });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({
    error: "Method not allowed."
  });
}
