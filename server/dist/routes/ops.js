import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
const opsRouter = Router();
opsRouter.use(requireAuth);
function hasIdentifierData(identifier) {
    return !!(identifier.product_id ||
        identifier.model ||
        identifier.mac ||
        identifier.dev_id ||
        identifier.serial_number ||
        identifier.barcode);
}
function parseVisionResponse(visionResult) {
    const response = { identifiers: [] };
    const annotations = visionResult?.responses?.[0];
    if (!annotations)
        return response;
    const fullText = annotations?.fullTextAnnotation?.text ||
        annotations?.textAnnotations?.[0]?.description ||
        "";
    response.raw_text = fullText;
    if (annotations.barcodeAnnotations && annotations.barcodeAnnotations.length > 0) {
        for (const barcode of annotations.barcodeAnnotations) {
            response.identifiers.push({
                barcode: barcode.rawValue,
                product_id: barcode.rawValue,
                confidence: 0.98,
            });
        }
    }
    if (!fullText)
        return response;
    const lines = String(fullText)
        .split(/[\n\r]+/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    let currentIdentifier = null;
    for (const line of lines) {
        const upper = line.toUpperCase();
        if (upper.includes("PRODUCT") && upper.includes(":") && !upper.includes("PRIME")) {
            if (currentIdentifier && hasIdentifierData(currentIdentifier)) {
                response.identifiers.push(currentIdentifier);
            }
            currentIdentifier = {};
            const match = line.match(/[Pp]roduct\s*:\s*(.+?)(?:\s*$)/);
            if (match)
                currentIdentifier.product_id = match[1].trim();
            continue;
        }
        if (!currentIdentifier)
            currentIdentifier = {};
        if (upper.includes("MODEL") && upper.includes(":")) {
            const match = line.match(/[Mm]odel\s*:\s*(.+?)(?:\s*$)/);
            if (match)
                currentIdentifier.model = match[1].trim();
        }
        if (upper.includes("MAC") && upper.includes(":")) {
            const match = line.match(/[Mm][Aa][Cc]\s*:\s*([A-Fa-f0-9:\-\s]+?)(?:\s*$)/);
            if (match) {
                const mac = match[1].trim().toUpperCase().replace(/[\s:\-]/g, "");
                if (mac.length >= 12)
                    currentIdentifier.mac = mac;
            }
        }
        if ((upper.includes("DEV") || upper.includes("DEVICE")) && upper.includes("ID")) {
            const match = line.match(/[Dd]ev(?:ice)?\s*[Ii][Dd]\s*:\s*([A-Fa-f0-9\-._]+)/);
            if (match)
                currentIdentifier.dev_id = match[1].trim();
        }
        if ((upper.includes("SERIAL") || upper.includes("S/N")) && upper.includes(":")) {
            const match = line.match(/(?:[Ss]erial|S\/N|SN)\s*:\s*([A-Za-z0-9\-._]+)/);
            if (match)
                currentIdentifier.serial_number = match[1].trim();
        }
    }
    if (currentIdentifier && hasIdentifierData(currentIdentifier)) {
        currentIdentifier.confidence = currentIdentifier.confidence ?? 0.85;
        response.identifiers.push(currentIdentifier);
    }
    if (response.identifiers.length === 0) {
        const identifier = {};
        const patterns = {
            product_id: /(?:PRODUCT|PRODUCT_ID|P\/N|PART\s*NUMBER|SKU|PRODUCT\s*CODE)[:\s]*([A-Z0-9\-._]+)/i,
            model: /(?:MODEL|MDL)[:\s]*([A-Z0-9\-._]+)/i,
            mac: /MAC\s*ADDRESS?[:\s]*([0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5}|[0-9A-Fa-f]{12})/i,
            dev_id: /(?:DEVICE|DEV)\s*ID[:\s]*([A-Z0-9\-._]+)/i,
        };
        for (const [key, pattern] of Object.entries(patterns)) {
            const match = fullText.match(pattern);
            if (match?.[1]) {
                identifier[key] = match[1].trim();
            }
        }
        if (hasIdentifierData(identifier)) {
            identifier.confidence = 0.7;
            response.identifiers.push(identifier);
        }
    }
    return response;
}
async function runIdentifierOcr(base64ImageRaw) {
    if (!env.googleCloudApiKey) {
        throw new Error("GOOGLE_CLOUD_API_KEY is not configured on server");
    }
    const base64Image = base64ImageRaw.includes(",") ? base64ImageRaw.split(",")[1] : base64ImageRaw;
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${env.googleCloudApiKey}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            requests: [
                {
                    image: { content: base64Image },
                    features: [
                        { type: "TEXT_DETECTION", maxResults: 10 },
                        { type: "BARCODE_DETECTION", maxResults: 10 },
                        { type: "LABEL_DETECTION", maxResults: 10 },
                    ],
                },
            ],
        }),
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Vision API error (${response.status}): ${errorText}`);
    }
    const result = await response.json();
    if (result?.error?.message) {
        throw new Error(`Google Vision API returned error: ${result.error.message}`);
    }
    return parseVisionResponse(result);
}
opsRouter.post("/ocr/identifier-image", async (req, res) => {
    try {
        const base64Image = typeof req.body?.base64Image === "string" ? req.body.base64Image.trim() : "";
        if (!base64Image) {
            return res.status(400).json({ error: "base64Image is required" });
        }
        const result = await runIdentifierOcr(base64Image);
        return res.json(result);
    }
    catch (error) {
        return res.status(500).json({ error: error?.message || "Failed to process OCR request" });
    }
});
opsRouter.post("/ocr/product-image", async (req, res) => {
    try {
        const base64Image = typeof req.body?.base64Image === "string" ? req.body.base64Image.trim() : "";
        if (!base64Image) {
            return res.status(400).json({ error: "base64Image is required" });
        }
        const result = await runIdentifierOcr(base64Image);
        return res.json(result);
    }
    catch (error) {
        return res.status(500).json({ error: error?.message || "Failed to process OCR request" });
    }
});
opsRouter.get("/banks", async (req, res) => {
    const rows = await prisma.$queryRaw `
    SELECT id, bank_name
    FROM banks
    WHERE is_active = 1
    ORDER BY bank_name ASC
  `;
    return res.json(rows);
});
opsRouter.get("/transactions", async (req, res) => {
    const companyId = String(req.query.companyId || "");
    const viewAll = String(req.query.viewAll || "false") === "true";
    const filterSql = !viewAll && companyId ? Prisma.sql `WHERE t.company_id = ${companyId}` : Prisma.empty;
    const txRows = await prisma.$queryRaw `
    SELECT
      t.id, t.transaction_number, t.warehouse_id, t.agent_id, t.subtotal, t.discount_amount, t.total_amount, t.base_total,
      t.payment_method, NULL AS notes, t.agent_price, t.created_at, t.delivery_agent_name, t.delivered_to, t.delivery_address, t.bank_id,
      w.name AS warehouse_name, c.name AS company_name, b.bank_name,
      up.full_name AS agent_full_name, up.email AS agent_email
    FROM pos_transactions t
    LEFT JOIN warehouses w ON w.id = t.warehouse_id
    LEFT JOIN companies c ON c.id = t.company_id
    LEFT JOIN banks b ON b.id = t.bank_id
    LEFT JOIN user_profiles up ON up.user_id = t.agent_id
    ${filterSql}
    ORDER BY t.created_at DESC
    LIMIT 200
  `;
    const txIds = txRows.map((r) => r.id);
    const itemRows = txIds.length > 0
        ? await prisma.$queryRaw `
          SELECT
            i.id, i.transaction_id, i.quantity, i.unit_price, i.total_price, i.product_identifier, i.model, i.mac, i.dev_id,
            p.name AS product_name
          FROM pos_transaction_items i
          LEFT JOIN products p ON p.id = i.product_id
          WHERE i.transaction_id IN (${Prisma.join(txIds)})
        `
        : [];
    const itemMap = new Map();
    for (const item of itemRows) {
        const list = itemMap.get(item.transaction_id) || [];
        list.push(item);
        itemMap.set(item.transaction_id, list);
    }
    return res.json(txRows.map((row) => ({
        id: row.id,
        transaction_number: row.transaction_number,
        warehouse_id: row.warehouse_id || "",
        agent_id: row.agent_id || "",
        subtotal: Number(row.subtotal || 0),
        discount_amount: Number(row.discount_amount || 0),
        total_amount: Number(row.total_amount || 0),
        base_total: Number(row.base_total || 0),
        payment_method: row.payment_method || "",
        notes: row.notes || "",
        agent_price: Number(row.agent_price || 0),
        created_at: row.created_at,
        delivery_agent_name: row.delivery_agent_name || "",
        delivered_to: row.delivered_to || "",
        delivery_address: row.delivery_address || "",
        bank_id: row.bank_id || "",
        warehouses: { name: row.warehouse_name || "" },
        companies: { name: row.company_name || "" },
        banks: { bank_name: row.bank_name || "" },
        user_profiles: row.agent_full_name ? { full_name: row.agent_full_name, email: row.agent_email || "" } : null,
        items: (itemMap.get(row.id) || []).map((item) => ({
            id: item.id,
            quantity: Number(item.quantity || 0),
            unit_price: Number(item.unit_price || 0),
            total_price: Number(item.total_price || 0),
            product_identifier: item.product_identifier || "",
            model: item.model || "",
            mac: item.mac || "",
            dev_id: item.dev_id || "",
            products: { name: item.product_name || "Unknown" },
        })),
    })));
});
opsRouter.get("/transactions/by-number/:transactionNumber", async (req, res) => {
    const txRows = await prisma.$queryRaw `
    SELECT
      t.id, t.transaction_number, t.warehouse_id, t.agent_id, t.subtotal, t.discount_amount, t.total_amount, t.base_total,
      t.payment_method, NULL AS notes, t.agent_price, t.created_at, t.delivery_agent_name, t.delivered_to, t.delivery_address, t.bank_id,
      w.name AS warehouse_name, c.name AS company_name, b.bank_name,
      up.full_name AS agent_full_name, up.email AS agent_email
    FROM pos_transactions t
    LEFT JOIN warehouses w ON w.id = t.warehouse_id
    LEFT JOIN companies c ON c.id = t.company_id
    LEFT JOIN banks b ON b.id = t.bank_id
    LEFT JOIN user_profiles up ON up.user_id = t.agent_id
    WHERE t.transaction_number = ${req.params.transactionNumber}
    LIMIT 1
  `;
    const row = txRows[0];
    if (!row) {
        return res.status(404).json({ error: "Transaction not found" });
    }
    const itemRows = await prisma.$queryRaw `
    SELECT
      i.id, i.transaction_id, i.quantity, i.unit_price, i.total_price, i.edited_unit_price, i.product_identifier, i.model, i.mac, i.dev_id,
      p.name AS product_name
    FROM pos_transaction_items i
    LEFT JOIN products p ON p.id = i.product_id
    WHERE i.transaction_id = ${row.id}
    ORDER BY i.created_at ASC
  `;
    return res.json({
        id: row.id,
        transaction_number: row.transaction_number,
        warehouse_id: row.warehouse_id || "",
        agent_id: row.agent_id || "",
        subtotal: Number(row.subtotal || 0),
        discount_amount: Number(row.discount_amount || 0),
        total_amount: Number(row.total_amount || 0),
        base_total: Number(row.base_total || 0),
        payment_method: row.payment_method || "",
        notes: row.notes || "",
        agent_price: Number(row.agent_price || 0),
        created_at: row.created_at,
        delivery_agent_name: row.delivery_agent_name || "",
        delivered_to: row.delivered_to || "",
        delivery_address: row.delivery_address || "",
        bank_id: row.bank_id || "",
        warehouses: { name: row.warehouse_name || "" },
        companies: { name: row.company_name || "" },
        banks: { bank_name: row.bank_name || "" },
        user_profiles: row.agent_full_name ? { full_name: row.agent_full_name, email: row.agent_email || "" } : null,
        items: itemRows.map((item) => ({
            id: item.id,
            quantity: Number(item.quantity || 0),
            unit_price: Number(item.edited_unit_price ?? item.unit_price ?? 0),
            total_price: Number(item.total_price || 0),
            product_identifier: item.product_identifier || "",
            model: item.model || "",
            mac: item.mac || "",
            dev_id: item.dev_id || "",
            products: { name: item.product_name || "Unknown" },
        })),
    });
});
opsRouter.put("/transactions/:id", async (req, res) => {
    const payload = req.body;
    await prisma.$transaction(async (tx) => {
        await tx.$executeRaw `
      UPDATE pos_transactions
      SET
        discount_amount = ${Number(payload.discount_amount || 0)},
        subtotal = ${Number(payload.subtotal || 0)},
        base_total = ${Number(payload.base_total || 0)},
        total_amount = ${Number(payload.total_amount || 0)},
        payment_method = ${payload.payment_method || null},
        delivery_agent_name = ${payload.delivery_agent_name || null},
        delivered_to = ${payload.delivered_to || null},
        delivery_address = ${payload.delivery_address || null},
        agent_price = ${Number(payload.agent_price || 0)},
        bank_id = ${payload.bank_id || null},
        updated_at = NOW()
      WHERE id = ${req.params.id}
    `;
        for (const item of payload.items || []) {
            await tx.$executeRaw `
        UPDATE pos_transaction_items
        SET
          unit_price = ${Number(item.unit_price || 0)},
          quantity = ${Number(item.quantity || 0)},
          total_price = ${Number(item.unit_price || 0) * Number(item.quantity || 0)}
        WHERE id = ${item.id}
      `;
        }
    });
    return res.json({ success: true });
});
opsRouter.delete("/transactions/:id", async (req, res) => {
    await prisma.$transaction([
        prisma.$executeRaw `DELETE FROM pos_transaction_items WHERE transaction_id = ${req.params.id}`,
        prisma.$executeRaw `DELETE FROM pos_transactions WHERE id = ${req.params.id}`,
    ]);
    return res.status(204).send();
});
opsRouter.get("/purchase-orders/bootstrap", async (req, res) => {
    const companyId = String(req.query.companyId || "");
    const viewAll = String(req.query.viewAll || "false") === "true";
    const poFilterSql = !viewAll && companyId ? Prisma.sql `AND po.company_id = ${companyId}` : Prisma.empty;
    const supplierFilterSql = !viewAll && companyId ? Prisma.sql `AND suppliers.company_id = ${companyId}` : Prisma.empty;
    const warehouseFilterSql = !viewAll && companyId ? Prisma.sql `AND w.company_id = ${companyId}` : Prisma.empty;
    const productFilterSql = !viewAll && companyId ? Prisma.sql `AND p.company_id = ${companyId}` : Prisma.empty;
    const [pos, suppliers, warehouses, products] = await Promise.all([
        prisma.$queryRaw `
      SELECT
        po.id, po.company_id, po.warehouse_id, po.po_number AS order_number, po.status, po.subtotal, po.total_landing_cost AS landing_costs_total, po.total_amount,
        po.expected_date, po.created_at,
        s.name AS supplier_name, w.name AS warehouse_name
      FROM purchase_orders po
      LEFT JOIN suppliers s ON s.id = po.supplier_id
      LEFT JOIN warehouses w ON w.id = po.warehouse_id
      WHERE 1=1 ${poFilterSql}
      ORDER BY po.created_at DESC
    `,
        prisma.$queryRaw `
      SELECT suppliers.id, suppliers.name FROM suppliers
      WHERE suppliers.is_active = 1 ${supplierFilterSql}
      ORDER BY name ASC
    `,
        prisma.$queryRaw `
      SELECT w.id, w.name, w.company_id, c.name AS company_name
      FROM warehouses w
      LEFT JOIN companies c ON c.id = w.company_id
      WHERE w.is_active = 1 ${warehouseFilterSql}
      ORDER BY w.name ASC
    `,
        prisma.$queryRaw `
      SELECT p.id, p.name, p.cost_price, p.sku FROM products p
      WHERE p.is_active = 1 ${productFilterSql}
      ORDER BY name ASC
    `,
    ]);
    return res.json({
        purchaseOrders: pos.map((po) => ({
            ...po,
            received_date: null,
            subtotal: Number(po.subtotal || 0),
            landing_costs_total: Number(po.landing_costs_total || 0),
            total_amount: Number(po.total_amount || 0),
            suppliers: { name: po.supplier_name || "" },
            warehouses: { name: po.warehouse_name || "" },
        })),
        suppliers,
        warehouses: warehouses.map((w) => ({
            id: w.id,
            name: w.name,
            company_id: w.company_id,
            companies: { name: w.company_name || "" },
        })),
        products: products.map((p) => ({
            id: p.id,
            name: p.name,
            cost_price: Number(p.cost_price || 0),
            sku: p.sku || "",
        })),
    });
});
opsRouter.get("/warehouse-stock", async (req, res) => {
    const warehouseId = String(req.query.warehouseId || "");
    if (!warehouseId)
        return res.json([]);
    const rows = await prisma.$queryRaw `
    SELECT product_id, quantity
    FROM current_stock
    WHERE warehouse_id = ${warehouseId}
  `;
    return res.json(rows.map((r) => ({ product_id: r.product_id, quantity: Number(r.quantity || 0) })));
});
opsRouter.get("/purchase-orders/:id/details", async (req, res) => {
    const poId = req.params.id;
    const [poRows, itemRows, lcRows] = await Promise.all([
        prisma.$queryRaw `SELECT id, company_id, supplier_id, warehouse_id, po_number AS order_number, expected_date, notes FROM purchase_orders WHERE id = ${poId} LIMIT 1`,
        prisma.$queryRaw `
      SELECT poi.id, poi.product_id, poi.quantity, poi.unit_cost, poi.total_cost, p.name AS product_name
      FROM purchase_order_items poi
      LEFT JOIN products p ON p.id = poi.product_id
      WHERE poi.purchase_order_id = ${poId}
    `,
        prisma.$queryRaw `
      SELECT id, cost_name AS cost_type, amount, NULL AS notes
      FROM purchase_order_landing_costs
      WHERE purchase_order_id = ${poId}
    `,
    ]);
    const po = poRows[0];
    if (!po)
        return res.status(404).json({ error: "Purchase order not found" });
    return res.json({
        po: {
            id: po.id,
            company_id: po.company_id,
            supplier_id: po.supplier_id || "",
            warehouse_id: po.warehouse_id,
            order_number: po.order_number,
            expected_date: po.expected_date ? new Date(po.expected_date).toISOString().slice(0, 10) : "",
            notes: po.notes || "",
        },
        items: itemRows.map((i) => ({
            id: i.id,
            product_id: i.product_id,
            quantity: Number(i.quantity || 0),
            unit_cost: Number(i.unit_cost || 0),
            total_cost: Number(i.total_cost || 0),
            products: { name: i.product_name || "Unknown" },
        })),
        landingCosts: lcRows.map((lc) => ({
            id: lc.id,
            cost_type: lc.cost_type,
            amount: Number(lc.amount || 0),
            notes: lc.notes || "",
        })),
    });
});
opsRouter.post("/purchase-orders", async (req, res) => {
    const payload = req.body;
    const poId = crypto.randomUUID();
    await prisma.$transaction(async (tx) => {
        await tx.$executeRaw `
      INSERT INTO purchase_orders (
        id, company_id, warehouse_id, supplier_id, po_number, status, order_date, expected_date, notes,
        subtotal, total_landing_cost, total_amount, created_by, created_at, updated_at
      ) VALUES (
        ${poId}, ${payload.company_id}, ${payload.warehouse_id}, ${payload.supplier_id || null}, ${payload.order_number},
        ${"pending"}, CURDATE(), ${payload.expected_date || null}, ${payload.notes || null},
        ${Number(payload.subtotal || 0)}, ${Number(payload.landing_costs_total || 0)}, ${Number(payload.total_amount || 0)},
        ${payload.created_by || null}, NOW(), NOW()
      )
    `;
        for (const item of payload.items || []) {
            await tx.$executeRaw `
        INSERT INTO purchase_order_items (id, purchase_order_id, product_id, quantity, unit_cost, total_cost, created_at)
        VALUES (${crypto.randomUUID()}, ${poId}, ${item.product_id}, ${Number(item.quantity || 0)}, ${Number(item.unit_cost || 0)}, ${Number(item.total_cost || 0)})`;
        }
        for (const lc of payload.landingCosts || []) {
            await tx.$executeRaw `
        INSERT INTO purchase_order_landing_costs (id, purchase_order_id, cost_name, amount, created_at)
        VALUES (${crypto.randomUUID()}, ${poId}, ${lc.cost_type}, ${Number(lc.amount || 0)})`;
        }
    });
    return res.status(201).json({ id: poId });
});
opsRouter.put("/purchase-orders/:id", async (req, res) => {
    const poId = req.params.id;
    const payload = req.body;
    await prisma.$transaction(async (tx) => {
        await tx.$executeRaw `
      UPDATE purchase_orders
      SET
        supplier_id = ${payload.supplier_id || null},
        warehouse_id = ${payload.warehouse_id},
        po_number = ${payload.order_number},
        expected_date = ${payload.expected_date || null},
        notes = ${payload.notes || null},
        subtotal = ${Number(payload.subtotal || 0)},
        total_landing_cost = ${Number(payload.landing_costs_total || 0)},
        total_amount = ${Number(payload.total_amount || 0)},
        updated_at = NOW()
      WHERE id = ${poId}
    `;
        await tx.$executeRaw `DELETE FROM purchase_order_items WHERE purchase_order_id = ${poId}`;
        await tx.$executeRaw `DELETE FROM purchase_order_landing_costs WHERE purchase_order_id = ${poId}`;
        for (const item of payload.items || []) {
            await tx.$executeRaw `
        INSERT INTO purchase_order_items (id, purchase_order_id, product_id, quantity, unit_cost, total_cost, created_at)
        VALUES (${crypto.randomUUID()}, ${poId}, ${item.product_id}, ${Number(item.quantity || 0)}, ${Number(item.unit_cost || 0)}, ${Number(item.total_cost || 0)})`;
        }
        for (const lc of payload.landingCosts || []) {
            await tx.$executeRaw `
        INSERT INTO purchase_order_landing_costs (id, purchase_order_id, cost_name, amount, created_at)
        VALUES (${crypto.randomUUID()}, ${poId}, ${lc.cost_type}, ${Number(lc.amount || 0)})`;
        }
    });
    return res.json({ success: true });
});
opsRouter.delete("/purchase-orders/:id", async (req, res) => {
    const poId = req.params.id;
    await prisma.$transaction([
        prisma.$executeRaw `DELETE FROM purchase_order_items WHERE purchase_order_id = ${poId}`,
        prisma.$executeRaw `DELETE FROM purchase_order_landing_costs WHERE purchase_order_id = ${poId}`,
        prisma.$executeRaw `DELETE FROM purchase_orders WHERE id = ${poId}`,
    ]);
    return res.status(204).send();
});
opsRouter.post("/purchase-orders/:id/receive", async (req, res) => {
    const poId = req.params.id;
    const createdBy = String(req.body?.created_by || "") || null;
    const poRows = await prisma.$queryRaw `
    SELECT id, company_id, warehouse_id, po_number FROM purchase_orders WHERE id = ${poId} LIMIT 1
  `;
    const po = poRows[0];
    if (!po)
        return res.status(404).json({ error: "Purchase order not found" });
    const items = await prisma.$queryRaw `
    SELECT product_id, quantity FROM purchase_order_items WHERE purchase_order_id = ${poId}
  `;
    if (items.length === 0)
        return res.status(400).json({ error: "No items found" });
    await prisma.$transaction(async (tx) => {
        for (const item of items) {
            const existing = await tx.$queryRaw `
        SELECT id, quantity
        FROM current_stock
        WHERE product_id = ${item.product_id} AND warehouse_id = ${po.warehouse_id}
        LIMIT 1
      `;
            const qty = Number(item.quantity || 0);
            if (existing[0]) {
                const newQty = Number(existing[0].quantity || 0) + qty;
                await tx.$executeRaw `
          UPDATE current_stock SET quantity = ${newQty} WHERE id = ${existing[0].id}
        `;
            }
            else {
                await tx.$executeRaw `
          INSERT INTO current_stock (id, product_id, warehouse_id, company_id, quantity)
          VALUES (${crypto.randomUUID()}, ${item.product_id}, ${po.warehouse_id}, ${po.company_id}, ${qty})`;
            }
            await tx.$executeRaw `
        INSERT INTO inventory_movements (
          id, product_id, warehouse_id, company_id, movement_type, quantity, reference_number, notes, created_by, created_at
        )
        VALUES (
          ${crypto.randomUUID()}, ${item.product_id}, ${po.warehouse_id}, ${po.company_id}, ${"in"}, ${qty},
          ${po.po_number}, ${`Received from PO ${po.po_number}`}, ${createdBy}, NOW()
        )
      `;
        }
        await tx.$executeRaw `
      UPDATE purchase_orders
      SET status = ${"received"}, updated_at = NOW()
      WHERE id = ${poId}
    `;
    });
    return res.json({ success: true });
});
opsRouter.get("/pos/bootstrap", async (req, res) => {
    const companyId = String(req.query.companyId || "");
    const mode = String(req.query.mode || "admin");
    const allowedWarehouseIds = String(req.query.allowedWarehouseIds || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    let warehouseFilter = Prisma.empty;
    if (mode === "hq") {
        warehouseFilter = Prisma.sql `WHERE w.is_active = 1`;
    }
    else if (mode === "restricted") {
        warehouseFilter = Prisma.sql `WHERE w.is_active = 1 AND w.company_id = ${companyId} AND w.id IN (${Prisma.join(allowedWarehouseIds.length ? allowedWarehouseIds : [""])})`;
    }
    else {
        warehouseFilter = Prisma.sql `WHERE w.is_active = 1 AND w.company_id = ${companyId}`;
    }
    const warehouses = await prisma.$queryRaw `
    SELECT w.id, w.name, w.company_id, c.name AS company_name
    FROM warehouses w
    LEFT JOIN companies c ON c.id = w.company_id
    ${warehouseFilter}
    ORDER BY w.name ASC
  `;
    const companyIds = Array.from(new Set(warehouses.map((w) => w.company_id)));
    if (companyIds.length === 0) {
        return res.json({ warehouses: [], products: [], categories: [], vouchers: [], banks: [] });
    }
    const [products, categories, vouchers, banks] = await Promise.all([
        prisma.$queryRaw `
      SELECT id, name, selling_price, sku, category_id, company_id
      FROM products
      WHERE is_active = 1 AND company_id IN (${Prisma.join(companyIds)})
      ORDER BY name ASC
    `,
        prisma.$queryRaw `
      SELECT id, name, company_id
      FROM categories
      WHERE company_id IN (${Prisma.join(companyIds)})
      ORDER BY name ASC
    `,
        prisma.$queryRaw `
      SELECT id, code, description, discount_type, discount_value, is_active, company_id
      FROM vouchers
      WHERE is_active = 1 AND (company_id IS NULL OR company_id IN (${Prisma.join(companyIds)}))
      ORDER BY code ASC
    `,
        prisma.$queryRaw `
      SELECT id, bank_name, current_amount
      FROM banks
      WHERE is_active = 1
      ORDER BY bank_name ASC
    `,
    ]);
    return res.json({
        warehouses: warehouses.map((w) => ({
            id: w.id,
            name: w.name,
            company_id: w.company_id,
            company_name: w.company_name || "Unknown Company",
        })),
        products: products.map((p) => ({
            id: p.id,
            name: p.name,
            selling_price: Number(p.selling_price || 0),
            sku: p.sku || "",
            category_id: p.category_id,
            company_id: p.company_id,
        })),
        categories,
        vouchers: vouchers.map((v) => ({
            id: v.id,
            code: v.code || "",
            description: v.description || "",
            discount_type: v.discount_type === "percentage" ? "percentage" : "fixed",
            discount_value: Number(v.discount_value || 0),
            min_purchase_amount: 0,
            max_usage: 0,
            current_usage: 0,
            valid_from: new Date(0).toISOString(),
            valid_until: null,
            is_active: Boolean(v.is_active),
            company_id: v.company_id || "",
        })),
        banks: banks.map((b) => ({
            id: b.id,
            bank_name: b.bank_name,
            current_amount: Number(b.current_amount || 0),
            company_id: "",
        })),
    });
});
opsRouter.get("/stock", async (req, res) => {
    const warehouseId = String(req.query.warehouseId || "");
    if (!warehouseId)
        return res.json([]);
    const rows = await prisma.$queryRaw `
    SELECT product_id, quantity
    FROM current_stock
    WHERE warehouse_id = ${warehouseId}
  `;
    return res.json(rows.map((r) => ({ product_id: r.product_id, quantity: Number(r.quantity || 0) })));
});
opsRouter.get("/dashboard/summary", async (req, res) => {
    const companyId = String(req.query.companyId || "");
    const viewAll = String(req.query.viewAll || "false") === "true";
    const allowedWarehouseIds = String(req.query.allowedWarehouseIds || "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    const warehouseFilter = allowedWarehouseIds.length > 0 ? Prisma.sql `AND cs.warehouse_id IN (${Prisma.join(allowedWarehouseIds)})` : Prisma.empty;
    const companyFilterSql = !viewAll && companyId ? Prisma.sql `AND c.id = ${companyId}` : Prisma.empty;
    const companyFilterStockSql = !viewAll && companyId ? Prisma.sql `AND w.company_id = ${companyId}` : Prisma.empty;
    const companyFilterTxSql = !viewAll && companyId ? Prisma.sql `AND t.company_id = ${companyId}` : Prisma.empty;
    const companyFilterExpSql = !viewAll && companyId ? Prisma.sql `AND e.company_id = ${companyId}` : Prisma.empty;
    const companyFilterDvSql = !viewAll && companyId ? Prisma.sql `AND dv.company_id = ${companyId}` : Prisma.empty;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const [productsCountRows, warehousesCountRows, stockRows, txRows, recentRows, expRows, dvRows, inventoryRows, banksRows] = await Promise.all([
        prisma.$queryRaw `
      SELECT COUNT(*) AS total
      FROM products p
      WHERE p.is_active = 1
        ${!viewAll && companyId ? Prisma.sql `AND p.company_id = ${companyId}` : Prisma.empty}
    `,
        prisma.$queryRaw `
      SELECT COUNT(*) AS total
      FROM warehouses w
      WHERE w.is_active = 1
        ${!viewAll && companyId ? Prisma.sql `AND w.company_id = ${companyId}` : Prisma.empty}
    `,
        prisma.$queryRaw `
      SELECT
        cs.product_id,
        cs.quantity,
        COALESCE(p.low_stock_alert, 0) AS low_stock_alert,
        p.name AS product_name
      FROM current_stock cs
      INNER JOIN products p ON p.id = cs.product_id
      INNER JOIN warehouses w ON w.id = cs.warehouse_id
      WHERE 1 = 1
        ${companyFilterStockSql}
        ${warehouseFilter}
    `,
        prisma.$queryRaw `
      SELECT t.id, t.base_total, t.created_at, t.warehouse_id
      FROM pos_transactions t
      WHERE 1 = 1
        ${companyFilterTxSql}
        ${allowedWarehouseIds.length > 0 ? Prisma.sql `AND t.warehouse_id IN (${Prisma.join(allowedWarehouseIds)})` : Prisma.empty}
    `,
        prisma.$queryRaw `
      SELECT
        t.id, t.transaction_number, t.base_total, t.payment_method, t.created_at,
        w.name AS warehouse_name
      FROM pos_transactions t
      LEFT JOIN warehouses w ON w.id = t.warehouse_id
      WHERE 1 = 1
        ${companyFilterTxSql}
        ${allowedWarehouseIds.length > 0 ? Prisma.sql `AND t.warehouse_id IN (${Prisma.join(allowedWarehouseIds)})` : Prisma.empty}
      ORDER BY t.created_at DESC
      LIMIT 5
    `,
        prisma.$queryRaw `
      SELECT amount
      FROM expenses e
      WHERE DATE(e.expense_date) >= ${monthStart}
        ${companyFilterExpSql}
    `,
        prisma.$queryRaw `
      SELECT amount
      FROM disbursement_vouchers dv
      WHERE DATE(dv.date) >= ${monthStart}
        ${companyFilterDvSql}
    `,
        prisma.$queryRaw `
      SELECT cs.quantity, p.selling_price, p.cost_price
      FROM current_stock cs
      INNER JOIN products p ON p.id = cs.product_id
      INNER JOIN warehouses w ON w.id = cs.warehouse_id
      INNER JOIN companies c ON c.id = w.company_id
      WHERE 1 = 1
        ${companyFilterSql}
        ${warehouseFilter}
    `,
        prisma.$queryRaw `
      SELECT b.id, b.bank_name, b.current_amount
      FROM banks b
      WHERE b.is_active = 1
      ORDER BY b.bank_name ASC
    `,
    ]);
    const productTotals = new Map();
    for (const row of stockRows) {
        const prev = productTotals.get(row.product_id) || {
            name: row.product_name || "Unknown",
            qty: 0,
            alert: Number(row.low_stock_alert || 0),
        };
        prev.qty += Number(row.quantity || 0);
        productTotals.set(row.product_id, prev);
    }
    let lowStockCount = 0;
    let outOfStockCount = 0;
    const lowStock = [];
    for (const value of productTotals.values()) {
        if (value.qty <= 0) {
            outOfStockCount += 1;
            lowStock.push({ product_name: value.name, warehouse_name: "All", quantity: 0, low_stock_alert: value.alert });
        }
        else if (value.qty <= value.alert) {
            lowStockCount += 1;
            lowStock.push({ product_name: value.name, warehouse_name: "All", quantity: value.qty, low_stock_alert: value.alert });
        }
    }
    const todaySales = txRows
        .filter((r) => r.created_at.toISOString().slice(0, 10) === todayStr)
        .reduce((sum, r) => sum + Number(r.base_total || 0), 0);
    const monthlySales = txRows
        .filter((r) => r.created_at.toISOString().slice(0, 10) >= monthStart)
        .reduce((sum, r) => sum + Number(r.base_total || 0), 0);
    const totalSales = txRows.reduce((sum, r) => sum + Number(r.base_total || 0), 0);
    const monthlyExpenses = expRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const monthlyDisbursements = dvRows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    let totalInventoryValue = 0;
    let totalCostingValue = 0;
    for (const row of inventoryRows) {
        const qty = Number(row.quantity || 0);
        totalInventoryValue += qty * Number(row.selling_price || 0);
        totalCostingValue += qty * Number(row.cost_price || 0);
    }
    return res.json({
        stats: {
            totalProducts: Number(productsCountRows[0]?.total || 0),
            totalWarehouses: Number(warehousesCountRows[0]?.total || 0),
            totalStockUnits: Array.from(productTotals.values()).reduce((sum, p) => sum + p.qty, 0),
            lowStockCount,
            outOfStockCount,
            todaySales,
            monthlySales,
            totalSales,
            transactionCount: txRows.length,
            monthlyExpenses,
            monthlyDisbursements,
            totalInventoryValue,
            totalCostingValue,
            totalValueLessCost: totalInventoryValue - totalCostingValue,
        },
        recentTxns: recentRows.map((r) => ({
            id: r.id,
            transaction_number: r.transaction_number,
            base_total: Number(r.base_total || 0),
            payment_method: r.payment_method || "",
            created_at: r.created_at,
            warehouses: { name: r.warehouse_name || "" },
            pos_transaction_items: [],
        })),
        lowStock: lowStock.slice(0, 10),
        banks: banksRows.map((b) => ({
            id: b.id,
            bank_name: b.bank_name,
            current_amount: Number(b.current_amount || 0),
        })),
    });
});
opsRouter.get("/product-identifiers", async (req, res) => {
    const productId = String(req.query.productId || "");
    const warehouseId = String(req.query.warehouseId || "");
    if (!productId)
        return res.json([]);
    const rows = await prisma.$queryRaw `
    SELECT id, product_identifier, model, mac, dev_id, warehouse_id
    FROM product_identifiers
    WHERE product_id = ${productId} AND (${warehouseId} = '' OR warehouse_id IS NULL OR warehouse_id = ${warehouseId})
    ORDER BY created_at ASC
  `;
    return res.json(rows);
});
opsRouter.get("/product-identifiers/search", async (req, res) => {
    const warehouseId = String(req.query.warehouseId || "");
    const q = String(req.query.q || "").trim();
    if (!warehouseId || !q) {
        return res.json(null);
    }
    const normalized = q.toLowerCase().replace(/[:\-]/g, "");
    const rows = await prisma.$queryRaw `
    SELECT
      pi.id, pi.product_id, pi.product_identifier, pi.model, pi.mac, pi.dev_id,
      p.name AS product_name, p.selling_price, p.sku, p.category_id, p.company_id
    FROM product_identifiers pi
    INNER JOIN products p ON p.id = pi.product_id
    WHERE (pi.warehouse_id IS NULL OR pi.warehouse_id = ${warehouseId})
      AND (
        REPLACE(REPLACE(LOWER(COALESCE(pi.product_identifier, '')), ':', ''), '-', '') = ${normalized}
        OR REPLACE(REPLACE(LOWER(COALESCE(pi.mac, '')), ':', ''), '-', '') = ${normalized}
        OR REPLACE(REPLACE(LOWER(COALESCE(pi.model, '')), ':', ''), '-', '') = ${normalized}
        OR REPLACE(REPLACE(LOWER(COALESCE(pi.dev_id, '')), ':', ''), '-', '') = ${normalized}
      )
    LIMIT 1
  `;
    const row = rows[0];
    if (!row)
        return res.json(null);
    return res.json({
        identifier: {
            id: row.id,
            product_identifier: row.product_identifier || "",
            model: row.model || "",
            mac: row.mac || "",
            dev_id: row.dev_id || "",
        },
        product: {
            id: row.product_id,
            name: row.product_name,
            selling_price: Number(row.selling_price || 0),
            sku: row.sku || "",
            category_id: row.category_id,
            company_id: row.company_id,
        },
    });
});
opsRouter.post("/pos/checkout", async (req, res) => {
    const payload = req.body;
    const txId = crypto.randomUUID();
    const txNumber = `TXN-${Date.now()}`;
    await prisma.$transaction(async (tx) => {
        await tx.$executeRaw `
      INSERT INTO pos_transactions (
        id, company_id, warehouse_id, agent_id, voucher_id, bank_id, transaction_number, subtotal, discount_amount,
        total_amount, base_total, agent_price, payment_method, delivery_agent_name, delivered_to, delivery_address, created_at, updated_at
      ) VALUES (
        ${txId}, ${payload.company_id}, ${payload.warehouse_id}, ${payload.agent_id || null}, ${payload.voucher_id || null}, ${payload.bank_id || null},
        ${txNumber}, ${Number(payload.subtotal || 0)}, ${Number(payload.discount_amount || 0)}, ${Number(payload.total_amount || 0)},
        ${Number(payload.base_total || 0)}, ${Number(payload.agent_price || 0)}, ${payload.payment_method}, ${payload.delivery_agent_name || null},
        ${payload.delivered_to || null}, ${payload.delivery_address || null}, NOW(), NOW()
      )
    `;
        for (const item of payload.items || []) {
            await tx.$executeRaw `
        INSERT INTO pos_transaction_items (
          id, transaction_id, product_id, warehouse_id, product_identifier, model, mac, dev_id, quantity, unit_price, edited_unit_price, total_price, created_at
        ) VALUES (
          ${crypto.randomUUID()}, ${txId}, ${item.product_id}, ${payload.warehouse_id}, ${item.product_identifier || null}, ${item.model || null},
          ${item.mac || null}, ${item.dev_id || null}, ${Number(item.quantity || 0)}, ${Number(item.unit_price || 0)},
          ${item.edited_unit_price ?? null}, ${Number(item.total_price || 0)}, NOW()
        )
      `;
            const stockRows = await tx.$queryRaw `
        SELECT id, quantity FROM current_stock
        WHERE product_id = ${item.product_id} AND warehouse_id = ${payload.warehouse_id}
        LIMIT 1
      `;
            const currentQty = Number(stockRows[0]?.quantity || 0);
            const newQty = Math.max(0, currentQty - Number(item.quantity || 0));
            if (stockRows[0]) {
                await tx.$executeRaw `UPDATE current_stock SET quantity = ${newQty} WHERE id = ${stockRows[0].id}`;
            }
            await tx.$executeRaw `
        INSERT INTO inventory_movements (
          id, product_id, warehouse_id, company_id, movement_type, quantity, reference_number, notes, created_by, created_at
        ) VALUES (
          ${crypto.randomUUID()}, ${item.product_id}, ${payload.warehouse_id}, ${payload.company_id}, ${"out"},
          ${Number(item.quantity || 0)}, ${txNumber}, ${"POS sale"}, ${payload.agent_id || null}, NOW()
        )
      `;
            if (item.identifier_id) {
                await tx.$executeRaw `DELETE FROM product_identifiers WHERE id = ${item.identifier_id}`;
            }
        }
        if (payload.payment_method === "bank" && payload.bank_id) {
            const bankRows = await tx.$queryRaw `
        SELECT current_amount FROM banks WHERE id = ${payload.bank_id} LIMIT 1
      `;
            if (bankRows[0]) {
                await tx.$executeRaw `
          UPDATE banks SET current_amount = ${Number(bankRows[0].current_amount || 0) + Number(payload.base_total || 0)}, updated_at = NOW()
          WHERE id = ${payload.bank_id}
        `;
            }
        }
    });
    return res.status(201).json({ id: txId, transaction_number: txNumber });
});
opsRouter.get("/inventory/bootstrap", async (req, res) => {
    const companyId = String(req.query.companyId || "");
    const viewAll = String(req.query.viewAll || "false") === "true";
    const allowedWarehouseIds = String(req.query.allowedWarehouseIds || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    const whFilter = allowedWarehouseIds.length > 0
        ? Prisma.sql ` AND w.id IN (${Prisma.join(allowedWarehouseIds)})`
        : Prisma.empty;
    const companyFilter = !viewAll && companyId ? Prisma.sql ` AND w.company_id = ${companyId}` : Prisma.empty;
    const [warehouses, products, stockRows, movementRows, identifierRows] = await Promise.all([
        prisma.$queryRaw `
      SELECT w.id, w.name, w.company_id
      FROM warehouses w
      WHERE w.is_active = 1
      ${companyFilter}
      ${whFilter}
      ORDER BY w.name ASC
    `,
        prisma.$queryRaw `
      SELECT p.id, p.name, p.sku, p.company_id
      FROM products p
      WHERE p.is_active = 1
      ${!viewAll && companyId ? Prisma.sql `AND p.company_id = ${companyId}` : Prisma.empty}
      ORDER BY p.name ASC
    `,
        prisma.$queryRaw `
      SELECT
        cs.id, cs.product_id, cs.warehouse_id, cs.quantity,
        p.name AS product_name, p.sku AS product_sku, w.name AS warehouse_name, c.name AS company_name
      FROM current_stock cs
      LEFT JOIN products p ON p.id = cs.product_id
      LEFT JOIN warehouses w ON w.id = cs.warehouse_id
      LEFT JOIN companies c ON c.id = cs.company_id
      WHERE 1=1
      ${!viewAll && companyId ? Prisma.sql `AND cs.company_id = ${companyId}` : Prisma.empty}
      ${allowedWarehouseIds.length > 0 ? Prisma.sql `AND cs.warehouse_id IN (${Prisma.join(allowedWarehouseIds)})` : Prisma.empty}
    `,
        prisma.$queryRaw `
      SELECT
        m.id, m.product_id, m.warehouse_id, m.movement_type, m.quantity, m.reference_number, m.notes, m.created_at, m.created_by,
        p.name AS product_name, w.name AS warehouse_name, up.full_name, up.role
      FROM inventory_movements m
      LEFT JOIN products p ON p.id = m.product_id
      LEFT JOIN warehouses w ON w.id = m.warehouse_id
      LEFT JOIN user_profiles up ON up.user_id = m.created_by
      WHERE 1=1
      ${!viewAll && companyId ? Prisma.sql `AND m.company_id = ${companyId}` : Prisma.empty}
      ${allowedWarehouseIds.length > 0 ? Prisma.sql `AND m.warehouse_id IN (${Prisma.join(allowedWarehouseIds)})` : Prisma.empty}
      ORDER BY m.created_at DESC
      LIMIT 100
    `,
        prisma.$queryRaw `
      SELECT id, product_id, warehouse_id, product_identifier, model, mac, dev_id
      FROM product_identifiers
    `,
    ]);
    const idMap = new Map();
    for (const row of identifierRows) {
        const key = `${row.product_id}-${row.warehouse_id || "all"}`;
        const arr = idMap.get(key) || [];
        arr.push({
            product_identifier: row.product_identifier || "",
            model: row.model || "",
            mac: row.mac || "",
            dev_id: row.dev_id || "",
        });
        idMap.set(key, arr);
    }
    return res.json({
        warehouses,
        products,
        stock: stockRows.map((s) => ({
            id: s.id,
            product_id: s.product_id,
            warehouse_id: s.warehouse_id,
            quantity: Number(s.quantity || 0),
            product_name: s.product_name || "",
            product_sku: s.product_sku || "",
            warehouse_name: s.warehouse_name || "",
            company_name: s.company_name || "",
            identifiers: idMap.get(`${s.product_id}-${s.warehouse_id}`) || idMap.get(`${s.product_id}-all`) || [],
        })),
        movements: movementRows.map((m) => ({
            id: m.id,
            product_id: m.product_id,
            warehouse_id: m.warehouse_id,
            movement_type: m.movement_type,
            quantity: Number(m.quantity || 0),
            reference_number: m.reference_number || "",
            notes: m.notes || "",
            created_at: m.created_at,
            created_by: m.created_by || "",
            products: { name: m.product_name || "" },
            warehouses: { name: m.warehouse_name || "" },
            user_profiles: m.full_name ? { full_name: m.full_name, role: m.role || "" } : null,
        })),
    });
});
opsRouter.get("/inventory/transfer-identifiers", async (req, res) => {
    const productId = String(req.query.productId || "");
    const warehouseId = String(req.query.warehouseId || "");
    if (!productId || !warehouseId)
        return res.json([]);
    const rows = await prisma.$queryRaw `
    SELECT id, product_identifier, model, mac, dev_id
    FROM product_identifiers
    WHERE product_id = ${productId} AND warehouse_id = ${warehouseId}
  `;
    return res.json(rows);
});
opsRouter.post("/inventory/movement", async (req, res) => {
    const payload = req.body;
    await prisma.$transaction(async (tx) => {
        const stockRows = await tx.$queryRaw `
      SELECT id, quantity FROM current_stock
      WHERE product_id = ${payload.product_id} AND warehouse_id = ${payload.warehouse_id}
      LIMIT 1
    `;
        const currentQty = Number(stockRows[0]?.quantity || 0);
        let newQty = currentQty;
        if (payload.movement_type === "in")
            newQty = currentQty + Number(payload.quantity || 0);
        if (payload.movement_type === "out")
            newQty = Math.max(0, currentQty - Number(payload.quantity || 0));
        if (payload.movement_type === "adjustment")
            newQty = Number(payload.quantity || 0);
        if (stockRows[0]) {
            await tx.$executeRaw `UPDATE current_stock SET quantity = ${newQty} WHERE id = ${stockRows[0].id}`;
        }
        else {
            await tx.$executeRaw `
        INSERT INTO current_stock (id, product_id, warehouse_id, company_id, quantity)
        VALUES (${crypto.randomUUID()}, ${payload.product_id}, ${payload.warehouse_id}, ${payload.company_id}, ${newQty})`;
        }
        await tx.$executeRaw `
      INSERT INTO inventory_movements (
        id, product_id, warehouse_id, company_id, movement_type, quantity, reference_number, notes, created_by, created_at
      ) VALUES (
        ${crypto.randomUUID()}, ${payload.product_id}, ${payload.warehouse_id}, ${payload.company_id}, ${payload.movement_type},
        ${Number(payload.quantity || 0)}, ${payload.reference_number}, ${payload.notes || null}, ${payload.created_by || null}, NOW()
      )
    `;
        for (const item of payload.identifiers || []) {
            if (!item.product_identifier && !item.model && !item.mac && !item.dev_id)
                continue;
            await tx.$executeRaw `
        INSERT INTO product_identifiers (id, product_id, warehouse_id, product_identifier, model, mac, dev_id, created_at)
        VALUES (
          ${crypto.randomUUID()}, ${payload.product_id}, ${item.warehouse_id || payload.warehouse_id},
          ${item.product_identifier || null}, ${item.model || null}, ${item.mac || null}, ${item.dev_id || null}, NOW()
        )
      `;
        }
    });
    return res.json({ success: true });
});
opsRouter.post("/inventory/transfer", async (req, res) => {
    const payload = req.body;
    const ref = `TRF-${Date.now()}`;
    await prisma.$transaction(async (tx) => {
        const sourceRows = await tx.$queryRaw `
      SELECT id, quantity FROM current_stock
      WHERE product_id = ${payload.product_id} AND warehouse_id = ${payload.from_warehouse_id}
      LIMIT 1
    `;
        const sourceQty = Number(sourceRows[0]?.quantity || 0);
        const qty = Number(payload.quantity || 0);
        if (!sourceRows[0] || sourceQty < qty) {
            throw new Error("Insufficient stock in source warehouse");
        }
        await tx.$executeRaw `UPDATE current_stock SET quantity = ${sourceQty - qty} WHERE id = ${sourceRows[0].id}`;
        const destRows = await tx.$queryRaw `
      SELECT id, quantity FROM current_stock
      WHERE product_id = ${payload.product_id} AND warehouse_id = ${payload.to_warehouse_id}
      LIMIT 1
    `;
        if (destRows[0]) {
            await tx.$executeRaw `UPDATE current_stock SET quantity = ${Number(destRows[0].quantity || 0) + qty} WHERE id = ${destRows[0].id}`;
        }
        else {
            await tx.$executeRaw `
        INSERT INTO current_stock (id, product_id, warehouse_id, company_id, quantity)
        VALUES (${crypto.randomUUID()}, ${payload.product_id}, ${payload.to_warehouse_id}, ${payload.company_id}, ${qty})`;
        }
        await tx.$executeRaw `
      INSERT INTO inventory_movements (id, product_id, warehouse_id, company_id, movement_type, quantity, reference_number, notes, created_by, created_at)
      VALUES
      (${crypto.randomUUID()}, ${payload.product_id}, ${payload.from_warehouse_id}, ${payload.company_id}, ${"transfer_out"}, ${qty}, ${ref}, ${payload.notes || "Transfer to warehouse"}, ${payload.created_by || null}, NOW()),
      (${crypto.randomUUID()}, ${payload.product_id}, ${payload.to_warehouse_id}, ${payload.company_id}, ${"transfer_in"}, ${qty}, ${ref}, ${payload.notes || "Transfer from warehouse"}, ${payload.created_by || null}, NOW())`;
        await tx.$executeRaw `
      INSERT INTO stock_transfers (id, company_id, product_id, from_warehouse_id, to_warehouse_id, quantity, reference_number, notes, status, created_by, created_at, updated_at)
      VALUES (${crypto.randomUUID()}, ${payload.company_id}, ${payload.product_id}, ${payload.from_warehouse_id}, ${payload.to_warehouse_id}, ${qty}, ${ref}, ${payload.notes || null}, ${"completed"}, ${payload.created_by || null}, NOW(), NOW())`;
        if ((payload.selected_identifier_ids || []).length > 0) {
            await tx.$executeRaw `
        UPDATE product_identifiers
        SET warehouse_id = ${payload.to_warehouse_id}
        WHERE id IN (${Prisma.join(payload.selected_identifier_ids || [""])})
      `;
        }
    });
    return res.json({ success: true });
});
opsRouter.delete("/inventory/stock/:id", async (req, res) => {
    await prisma.$executeRaw `DELETE FROM current_stock WHERE id = ${req.params.id}`;
    return res.status(204).send();
});
opsRouter.get("/products/bootstrap", async (req, res) => {
    const companyId = String(req.query.companyId || "");
    const viewAll = String(req.query.viewAll || "false") === "true";
    const filter = !viewAll && companyId ? Prisma.sql `AND p.company_id = ${companyId}` : Prisma.empty;
    const [products, categories, suppliers, units, warehouses, stockRows, identifierRows] = await Promise.all([
        prisma.$queryRaw `
      SELECT
        p.id, p.name, p.sku, p.barcode, p.description, p.cost_price, p.selling_price, p.low_stock_alert,
        p.category_id, p.supplier_id, p.unit_id, p.company_id, p.is_active,
        c.name AS category_name, s.name AS supplier_name, u.name AS unit_name, u.abbreviation AS unit_abbreviation, co.name AS company_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN units u ON u.id = p.unit_id
      LEFT JOIN companies co ON co.id = p.company_id
      WHERE p.is_active = 1
      ${filter}
      ORDER BY p.name ASC
    `,
        prisma.$queryRaw `
      SELECT id, name FROM categories
      WHERE 1=1 ${!viewAll && companyId ? Prisma.sql `AND company_id = ${companyId}` : Prisma.empty}
      ORDER BY name ASC
    `,
        prisma.$queryRaw `
      SELECT id, name FROM suppliers
      WHERE is_active = 1 ${!viewAll && companyId ? Prisma.sql `AND company_id = ${companyId}` : Prisma.empty}
      ORDER BY name ASC
    `,
        prisma.$queryRaw `
      SELECT id, name, abbreviation FROM units ORDER BY name ASC
    `,
        prisma.$queryRaw `
      SELECT id, name, company_id FROM warehouses
      WHERE is_active = 1 ${!viewAll && companyId ? Prisma.sql `AND company_id = ${companyId}` : Prisma.empty}
      ORDER BY name ASC
    `,
        prisma.$queryRaw `
      SELECT cs.product_id, cs.warehouse_id, cs.quantity, w.name AS warehouse_name
      FROM current_stock cs
      LEFT JOIN warehouses w ON w.id = cs.warehouse_id
      WHERE 1=1 ${!viewAll && companyId ? Prisma.sql `AND cs.company_id = ${companyId}` : Prisma.empty}
    `,
        prisma.$queryRaw `
      SELECT product_id FROM product_identifiers
    `,
    ]);
    const stockTotalMap = new Map();
    const warehouseNameMap = new Map();
    const warehouseIdsMap = new Map();
    for (const s of stockRows) {
        stockTotalMap.set(s.product_id, (stockTotalMap.get(s.product_id) || 0) + Number(s.quantity || 0));
        if (!warehouseNameMap.has(s.product_id) && s.warehouse_name)
            warehouseNameMap.set(s.product_id, s.warehouse_name);
        const ids = warehouseIdsMap.get(s.product_id) || [];
        if (!ids.includes(s.warehouse_id))
            ids.push(s.warehouse_id);
        warehouseIdsMap.set(s.product_id, ids);
    }
    const identifierCountMap = new Map();
    for (const r of identifierRows) {
        identifierCountMap.set(r.product_id, (identifierCountMap.get(r.product_id) || 0) + 1);
    }
    return res.json({
        products: products.map((p) => ({
            id: p.id,
            name: p.name,
            sku: p.sku || "",
            barcode: p.barcode || "",
            description: p.description || "",
            landing_cost: 0,
            cost_price: Number(p.cost_price || 0),
            selling_price: Number(p.selling_price || 0),
            low_stock_alert: Number(p.low_stock_alert || 0),
            category_id: p.category_id,
            supplier_id: p.supplier_id,
            unit_id: p.unit_id,
            company_id: p.company_id || "",
            is_active: Boolean(p.is_active),
            categories: p.category_name ? { id: p.category_id, name: p.category_name } : null,
            suppliers: p.supplier_name ? { id: p.supplier_id, name: p.supplier_name } : null,
            units: p.unit_name ? { id: p.unit_id, name: p.unit_name, abbreviation: p.unit_abbreviation || "" } : null,
            companies: p.company_name ? { id: p.company_id, name: p.company_name } : null,
            total_stock: stockTotalMap.get(p.id) || 0,
            warehouse_name: warehouseNameMap.get(p.id) || "-",
            warehouse_ids: warehouseIdsMap.get(p.id) || [],
            identifier_count: identifierCountMap.get(p.id) || 0,
        })),
        categories,
        suppliers,
        units,
        warehouses,
    });
});
opsRouter.get("/products/companies", async (_req, res) => {
    const rows = await prisma.$queryRaw `
    SELECT id, name FROM companies WHERE is_active = 1 ORDER BY name ASC
  `;
    return res.json(rows);
});
opsRouter.get("/products/warehouses", async (req, res) => {
    const companyId = String(req.query.companyId || "");
    const rows = await prisma.$queryRaw `
    SELECT id, name, company_id FROM warehouses
    WHERE is_active = 1 AND company_id = ${companyId}
    ORDER BY name ASC
  `;
    return res.json(rows);
});
opsRouter.get("/products/:id/details", async (req, res) => {
    const productId = req.params.id;
    const [landingCosts, identifiers, variants, companyAssignments, warehouseAssignments] = await Promise.all([
        prisma.$queryRaw `
      SELECT id, description, amount FROM landed_costs WHERE product_id = ${productId} ORDER BY created_at ASC
    `,
        prisma.$queryRaw `
      SELECT id, product_identifier, model, mac, dev_id, warehouse_id FROM product_identifiers WHERE product_id = ${productId} ORDER BY created_at ASC
    `,
        prisma.$queryRaw `
      SELECT id, sku, variant_name, price, cost_price FROM product_variants WHERE product_id = ${productId} ORDER BY created_at ASC
    `,
        prisma.$queryRaw `
      SELECT company_id FROM product_company_assignments WHERE product_id = ${productId}
    `,
        prisma.$queryRaw `
      SELECT warehouse_id FROM product_warehouse_assignments WHERE product_id = ${productId}
    `,
    ]);
    return res.json({
        landingCosts: landingCosts.map((c) => ({ id: c.id, cost_type: c.description, amount: String(c.amount || 0), notes: "" })),
        identifiers: identifiers.map((i) => ({
            id: i.id,
            product_identifier: i.product_identifier || "",
            model: i.model || "",
            mac: i.mac || "",
            dev_id: i.dev_id || "",
            warehouse_id: i.warehouse_id || "",
        })),
        variants: variants.map((v) => ({
            id: v.id,
            sku: v.sku || "",
            name: v.variant_name || "",
            selling_price: String(v.price || 0),
            cost_price: String(v.cost_price || 0),
        })),
        companyAssignments: companyAssignments.map((x) => x.company_id),
        warehouseAssignments: warehouseAssignments.map((x) => x.warehouse_id),
    });
});
opsRouter.post("/products/save", async (req, res) => {
    const payload = req.body;
    const productId = payload.id || crypto.randomUUID();
    await prisma.$transaction(async (tx) => {
        if (payload.id) {
            await tx.$executeRaw `
        UPDATE products
        SET
          name = ${payload.name},
          sku = ${payload.sku || null},
          barcode = ${payload.barcode || null},
          description = ${payload.description || null},
          cost_price = ${Number(payload.cost_price || 0)},
          selling_price = ${Number(payload.selling_price || 0)},
          low_stock_alert = ${Number(payload.low_stock_alert || 0)},
          category_id = ${payload.category_id || null},
          supplier_id = ${payload.supplier_id || null},
          unit_id = ${payload.unit_id || null},
          company_id = ${payload.company_id || null},
          updated_at = NOW()
        WHERE id = ${payload.id}
      `;
        }
        else {
            await tx.$executeRaw `
        INSERT INTO products (
          id, company_id, category_id, supplier_id, unit_id, name, sku, barcode, description, cost_price, selling_price, low_stock_alert, is_active, created_at, updated_at
        ) VALUES (
          ${productId}, ${payload.company_id || null}, ${payload.category_id || null}, ${payload.supplier_id || null}, ${payload.unit_id || null},
          ${payload.name}, ${payload.sku || null}, ${payload.barcode || null}, ${payload.description || null},
          ${Number(payload.cost_price || 0)}, ${Number(payload.selling_price || 0)}, ${Number(payload.low_stock_alert || 0)}, 1, NOW(), NOW()
        )
      `;
        }
        await tx.$executeRaw `DELETE FROM landed_costs WHERE product_id = ${productId}`;
        await tx.$executeRaw `DELETE FROM product_identifiers WHERE product_id = ${productId}`;
        await tx.$executeRaw `DELETE FROM product_variants WHERE product_id = ${productId}`;
        await tx.$executeRaw `DELETE FROM product_company_assignments WHERE product_id = ${productId}`;
        await tx.$executeRaw `DELETE FROM product_warehouse_assignments WHERE product_id = ${productId}`;
        for (const lc of payload.landingCosts || []) {
            if (!lc.cost_type || !Number(lc.amount || 0))
                continue;
            await tx.$executeRaw `
        INSERT INTO landed_costs (id, product_id, description, amount, created_at, updated_at)
        VALUES (${crypto.randomUUID()}, ${productId}, ${lc.cost_type}, ${Number(lc.amount || 0)}, NOW(), NOW())`;
        }
        for (const idf of payload.identifiers || []) {
            if (!idf.product_identifier && !idf.model && !idf.mac && !idf.dev_id)
                continue;
            await tx.$executeRaw `
        INSERT INTO product_identifiers (id, product_id, warehouse_id, product_identifier, model, mac, dev_id, created_at, updated_at)
        VALUES (
          ${crypto.randomUUID()}, ${productId}, ${idf.warehouse_id || null}, ${idf.product_identifier || null},
          ${idf.model || null}, ${idf.mac || null}, ${idf.dev_id || null}, NOW(), NOW()
        )
      `;
        }
        for (const v of payload.variants || []) {
            if (!v.sku || !v.name)
                continue;
            await tx.$executeRaw `
        INSERT INTO product_variants (id, product_id, variant_name, sku, price, cost_price, is_active, created_at, updated_at)
        VALUES (${crypto.randomUUID()}, ${productId}, ${v.name}, ${v.sku}, ${Number(v.selling_price || 0)}, ${Number(v.cost_price || 0)}, 1, NOW(), NOW())`;
        }
        for (const cId of payload.selectedCompanies || []) {
            await tx.$executeRaw `
        INSERT INTO product_company_assignments (id, product_id, company_id)
        VALUES (${crypto.randomUUID()}, ${productId}, ${cId})
      `;
        }
        for (const wId of payload.selectedWarehouses || []) {
            await tx.$executeRaw `
        INSERT INTO product_warehouse_assignments (id, product_id, warehouse_id)
        VALUES (${crypto.randomUUID()}, ${productId}, ${wId})
      `;
        }
    });
    return res.json({ id: productId });
});
opsRouter.delete("/products/:id", async (req, res) => {
    const id = req.params.id;
    try {
        await prisma.$transaction([
            prisma.$executeRaw `DELETE FROM current_stock WHERE product_id = ${id}`,
            prisma.$executeRaw `DELETE FROM product_identifiers WHERE product_id = ${id}`,
            prisma.$executeRaw `DELETE FROM landed_costs WHERE product_id = ${id}`,
            prisma.$executeRaw `DELETE FROM product_variants WHERE product_id = ${id}`,
            prisma.$executeRaw `DELETE FROM product_company_assignments WHERE product_id = ${id}`,
            prisma.$executeRaw `DELETE FROM product_warehouse_assignments WHERE product_id = ${id}`,
            prisma.$executeRaw `DELETE FROM products WHERE id = ${id}`,
        ]);
        return res.status(204).send();
    }
    catch (error) {
        const isFkRestrictError = error?.code === "P2010" && String(error?.meta?.code || "") === "1451";
        if (isFkRestrictError) {
            await prisma.$executeRaw `
        UPDATE products
        SET is_active = 0, updated_at = NOW()
        WHERE id = ${id}
      `;
            return res.status(200).json({
                success: true,
                mode: "soft-delete",
                message: "Product has linked records, so it was archived instead of hard deleted.",
            });
        }
        throw error;
    }
});
export default opsRouter;
