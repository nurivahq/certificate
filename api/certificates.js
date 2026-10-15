```javascript
module.exports = async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const adminPassword = process.env.CERTIFICATE_ADMIN_PASSWORD;

  // Supabase credentials are required for both operations.
  const missingVariables = [];

  if (!supabaseUrl?.trim()) {
    missingVariables.push("SUPABASE_URL");
  }

  if (!secretKey?.trim()) {
    missingVariables.push("SUPABASE_SECRET_KEY");
  }

  if (missingVariables.length > 0) {
    return res.status(500).json({
      error: "Supabase server configuration is incomplete.",
      missing: missingVariables
    });
  }

  // Support a Project URL with or without a trailing /rest/v1.
  const baseUrl = supabaseUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/i, "");

  let tableUrl;

  try {
    const parsedUrl = new URL(baseUrl);

    if (
      !["https:", "http:"].includes(parsedUrl.protocol) ||
      parsedUrl.pathname !== "" ||
      parsedUrl.search ||
      parsedUrl.hash
    ) {
      throw new Error("Invalid Supabase Project URL format.");
    }

    tableUrl = `${baseUrl}/rest/v1/certificates`;
  } catch {
    return res.status(500).json({
      error: "SUPABASE_URL is invalid. Use the Supabase Project URL."
    });
  }

  const headers = {
    apikey: secretKey.trim(),
    Authorization: `Bearer ${secretKey.trim()}`,
    "Content-Type": "application/json"
  };

  // GET: Verify a certificate using its ID.
  if (req.method === "GET") {
    const id = String(req.query?.id || "");

    if (!/^LW-\d{4}-[A-Z0-9]{6}$/.test(id)) {
      return res.status(400).json({
        error: "Invalid certificate ID."
      });
    }

    try {
      const url = new URL(tableUrl);

      url.searchParams.set("id", `eq.${id}`);
      url.searchParams.set(
        "select",
        "id,name,certificate_date,scores,logo,photo,issued_at,status"
      );

      const response = await fetch(url.toString(), {
        method: "GET",
        headers,
        cache: "no-store"
      });

      if (!response.ok) {
        const details = await response.text();

        return res.status(502).json({
          error: "Could not verify the certificate.",
          details
        });
      }

      const rows = await response.json();

      if (!Array.isArray(rows) || rows.length === 0) {
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
    } catch (error) {
      return res.status(500).json({
        error: "Certificate verification failed.",
        details: error.message
      });
    }
  }

  // POST: Save a certificate. Password required only for saving.
  if (req.method === "POST") {
    if (
      typeof adminPassword !== "string" ||
      !adminPassword.trim()
    ) {
      return res.status(500).json({
        error: "Administrator password is not configured.",
        missing: ["CERTIFICATE_ADMIN_PASSWORD"]
      });
    }

    const { adminPassword: suppliedPassword, record } = req.body || {};

    if (
      typeof suppliedPassword !== "string" ||
      suppliedPassword !== adminPassword
    ) {
      return res.status(401).json({
        error: "Incorrect administrator password."
      });
    }

    if (!record || typeof record !== "object" || Array.isArray(record)) {
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

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        error: "Enter a valid certificate date."
      });
    }

    const parsedDate = new Date(`${date}T00:00:00Z`);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== date
    ) {
      return res.status(400).json({
        error: "Enter a valid certificate date."
      });
    }

    const expectedTotals = {
      A1: 20,
      A2: 20,
      B1: 29
    };

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
      const url = new URL(tableUrl);
      url.searchParams.set("on_conflict", "id");

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const details = await response.text();

        return res.status(502).json({
          error: "Supabase could not save the certificate.",
          details
        });
      }

      return res.status(200).json({
        success: true,
        id
      });
    } catch (error) {
      return res.status(500).json({
        error: "Could not save the certificate.",
        details: error.message
      });
    }
  }

  res.setHeader("Allow", "GET, POST");

  return res.status(405).json({
    error: "Method not allowed."
  });
};
``
