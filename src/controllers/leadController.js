const prisma = require("../services/database");
const {
  collectLeads,
  processIncomingLead,
} = require("../collectors/indiamart");
const { generateLeadsExcel } = require("../services/excel");
const { sendLeadNotification } = require("../services/notification");

/**
 * GET /api/leads - Retrieve paginated and filtered leads list
 */
async function getLeads(req, res, next) {
  try {
    const {
      status,
      priority,
      city,
      product,
      phone,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Build filter conditions
    const where = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (phone) where.phone = phone;
    if (city) {
      where.city = { contains: city };
    }
    if (product) {
      where.product = { contains: product };
    }

    // Retrieve records
    const [leads, total] = await prisma.$transaction([
      prisma.lead.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          notes: true,
          notifications: true,
          duplicateOf: {
            select: { id: true, indiamartLeadId: true, buyerName: true },
          },
        },
      }),
      prisma.lead.count({ where }),
    ]);

    return res.status(200).json({
      success: true,
      data: leads,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/leads/collect - Manually trigger IndiaMART lead polling
 */
async function triggerCollection(req, res, next) {
  try {
    console.log("Manual collection triggered via HTTP endpoint.");
    const result = await collectLeads();

    // collectLeads() resolves normally even on failure (missing/invalid API key,
    // rate limiting, upstream errors) — it signals failure via a truthy `error`
    // field on the result rather than throwing. Check for that explicitly, or a
    // caller hitting this endpoint (e.g. a monitoring script) would see
    // `200 success: true` while Pull API reconciliation is actually broken.
    if (result?.error) {
      return res.status(502).json({
        success: false,
        message: "IndiaMART pull collection failed.",
        details: result,
      });
    }

    return res.status(200).json({
      success: true,
      message: "IndiaMART pull collection completed successfully.",
      details: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/leads/webhook - Receive and process real-time lead Push from IndiaMART
 */
async function receiveWebhook(req, res, next) {
  try {
    // 1. Webhook Secret Key validation
    const providedKey = req.query.key || req.headers["x-webhook-key"];
    const expectedKey = process.env.INDIAMART_WEBHOOK_SECRET;
    if (expectedKey && providedKey !== expectedKey) {
      console.warn("[Webhook] Rejected webhook call with invalid key.");
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized key." });
    }

    const payload = req.body;
    console.log(
      "Received push webhook from IndiaMART:",
      JSON.stringify(payload),
    );

    const leadData = payload?.RESPONSE || payload;
    const uniqueQueryId = (
      leadData?.UNIQUE_QUERY_ID ||
      leadData?.QUERY_ID ||
      leadData?.id
    )?.toString();
    if (!uniqueQueryId) {
      return res.status(400).json({
        success: false,
        message: "Invalid payload. UNIQUE_QUERY_ID/QUERY_ID/id is required.",
      });
    }

    // 2. Fast-path Idempotency check: check if raw lead already exists in DB
    const existingRaw = await prisma.leadRaw.findUnique({
      where: { indiamartLeadId: uniqueQueryId },
    });
    if (existingRaw) {
      console.log(
        `[Webhook] Duplicate webhook delivery for lead ${uniqueQueryId}, ignoring.`,
      );
      return res.status(200).json({
        success: true,
        message: "Duplicate webhook delivery, skipped.",
      });
    }

    // 3. Create raw record immediately in the DB to block duplicate retries
    try {
      await prisma.leadRaw.create({
        data: {
          indiamartLeadId: uniqueQueryId,
          source: "push",
          rawPayload: JSON.stringify(payload),
        },
      });
    } catch (err) {
      if (err.code === "P2002") {
        console.log(
          `[Webhook] Race-condition duplicate for lead ${uniqueQueryId}, safe to ignore.`,
        );
        return res.status(200).json({
          success: true,
          message: "Duplicate (race), skipped.",
        });
      }
      throw err;
    }

    // 4. Trigger full processing + scoring + notifications in the background (fire-and-forget)
    processIncomingLead(payload, "push").catch((err) => {
      console.error(
        `[Webhook] Background processing failed for lead ${uniqueQueryId}:`,
        err.message,
      );
    });

    // 5. Ack HTTP 200 immediately to prevent client timeouts
    return res.status(200).json({
      success: true,
      message: "Webhook payload received and queued for processing.",
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/leads/export - Export leads to a styled Excel sheet
 */
async function exportLeads(req, res, next) {
  try {
    const { status, priority, city, product } = req.query;

    const where = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (city) where.city = { contains: city };
    if (product) where.product = { contains: product };

    const leads = await prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { raw: true },
    });

    const buffer = await generateLeadsExcel(leads);

    const filename = `indiamart_leads_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${new Date().toTimeString().slice(0, 8).replace(/:/g, "")}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/leads/:id/status - Update lead status
 */
async function updateStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = [
      "new",
      "contacted",
      "follow_up",
      "closed",
      "rejected",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const updatedLead = await prisma.lead.update({
      where: { id: parseInt(id) },
      data: { status },
    });

    return res.status(200).json({
      success: true,
      lead: updatedLead,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/leads/:id/claim - Claim lead by staff member
 */
async function claimLead(req, res, next) {
  try {
    const { id } = req.params;
    const { claimedBy } = req.body;

    if (!claimedBy) {
      return res.status(400).json({
        success: false,
        message: "claimedBy is required.",
      });
    }

    const updatedLead = await prisma.lead.update({
      where: { id: parseInt(id) },
      data: {
        claimedBy,
        claimedAt: new Date(),
      },
    });

    return res.status(200).json({
      success: true,
      lead: updatedLead,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/leads/:id/notes - Add notes to a lead
 */
async function addNote(req, res, next) {
  try {
    const { id } = req.params;
    const { note, author } = req.body;

    if (!note) {
      return res.status(400).json({
        success: false,
        message: "Note content is required.",
      });
    }

    const leadNote = await prisma.leadNote.create({
      data: {
        leadId: parseInt(id),
        note,
        author: author || "System",
      },
    });

    return res.status(201).json({
      success: true,
      data: leadNote,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/leads/notify-test - Trigger a test notification
 */
async function triggerTestNotification(req, res, next) {
  try {
    // Find latest lead to test notification
    const latestLead = await prisma.lead.findFirst({
      orderBy: { createdAt: "desc" },
    });

    if (!latestLead) {
      return res.status(404).json({
        success: false,
        message:
          "No leads found in database. Run collect or send a webhook lead first.",
      });
    }

    console.log(
      `Sending test notification for Lead ID: ${latestLead.indiamartLeadId}`,
    );
    await sendLeadNotification(latestLead);

    return res.status(200).json({
      success: true,
      message: "Test notification triggered. Check server logs.",
      leadId: latestLead.id,
      indiamartLeadId: latestLead.indiamartLeadId,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getLeads,
  triggerCollection,
  receiveWebhook,
  exportLeads,
  updateStatus,
  claimLead,
  addNote,
  triggerTestNotification,
};
