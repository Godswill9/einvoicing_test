const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const forge = require("node-forge");
const QRCode = require("qrcode");
const crypto = require("crypto");
const https = require("https");
const agent = new https.Agent({ rejectUnauthorized: false });

//INTERNAL RESOURCES
//INTERNAL RESOURCES
//INTERNAL RESOURCES
//INTERNAL RESOURCES

//create new company customer reference uuid
async function ensureCustomerFirsUUID(
  supplierBusinessId,
  supplierName,
  erpCustomerCode,
  customerName,
  erp
) {
  try {
    // const [rows] = await pool.query(
    //   "SELECT generated_customer_firs_uuid FROM customer_integration_map WHERE erp_customer_code = ? AND supplier_business_id = ? AND customerName = ?",
    //   [erpCustomerCode, supplierBusinessId, customerName]
    // );

    console.log(erpCustomerCode);
    // If record already exists, return it
    // if (rows.length > 0) {
    //   return rows[0].generated_customer_firs_uuid;
    // }

    // Otherwise, generate new UUID and insert
    const generatedUUID = uuidv4();

    // await pool.query(
    //   `INSERT INTO customer_integration_map
    //   (id, supplier_business_id, supplier_name, erp_customer_code, generated_customer_firs_uuid, customerName, erp, created_at)
    //   VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    //   [
    //     uuidv4(), // id
    //     supplierBusinessId, // supplier_business_id
    //     supplierName, // supplier_name
    //     erpCustomerCode, // erp_customer_code
    //     generatedUUID, // generated_customer_firs_uuid
    //     customerName, // customerName
    //     erp, // erp
    //   ]
    // );
    console.log(generatedUUID);
    return generatedUUID;
  } catch (err) {
    console.error("Error ensuring customer FIRS UUID:", err);
    throw err;
  }
}

async function mapSage300ToInvoiceJsonTest(
  serviceId,
  irn,
  firsBusinessId,
  company,
  invoiceBatch,
  supplierData,
  customerData = {}
) {
  // const invoice = invoiceBatch;
  const invoice = (invoiceBatch.Invoices && invoiceBatch.Invoices[0]) || {};
  const lines = invoice.InvoiceDetails || [];
  // ✅ await the async DB function
  const customerFirsUUID = await ensureCustomerFirsUUID(
    firsBusinessId, // supplierBusinessId
    supplierData.party_name, // supplierName
    invoice.CustomerNumber, // erp_customer_code
    customerData.party_name, // customerName
    "Sage300" // erp
  );
  console.log(supplierData);

  return {
    businessId: firsBusinessId,
    // irn: generate300IRN(
    //   invoice.DocumentNumber || "",
    //   serviceId,
    //   invoice.DocumentDate
    // ),
    irn: irn,
    issueDate: formatToYMD(invoice.DocumentDate) || "",
    dueDate: formatToYMD(invoice.DueDate) || "",
    invoiceTypeCode: getFirsInvoiceCode(invoice.DocumentType) || "",
    note: invoice.InvoiceDescription || invoiceBatch.Description || "",
    taxPointDate: formatToYMD(invoice.DocumentDate) || "",
    documentCurrencyCode: invoice.CurrencyCode || "",
    taxCurrencyCode: invoice.CurrencyCode || "",
    accountingCost: `${invoice.DocumentTotalIncludingTax || 0} ${
      invoice.CurrencyCode || ""
    }`,
    buyerReference: invoice.CustomerNumber || "",

    //REMOVED FOR TESTING
    // invoiceDeliveryPeriod: {
    //   startDate: formatToYMD(invoiceBatch.BatchDate) || "",
    //   endDate: formatToYMD(invoiceBatch.BatchDate) || "",
    // },
    billingReference:[],
    accountingSupplierParty: {
      partyName: supplierData.party_name || "",
      tin: supplierData.tin || "",
      email: supplierData.email || "",
      telephone: formatInternationalPhone(supplierData.telephone) || "",
      businessDescription: supplierData.business_description || "",
      postalAddress: supplierData.postal_address || {},
    },

    accountingCustomerParty: {
      id: customerFirsUUID || "",
      partyName: customerData.party_name || "",
      tin: customerData.tin || "",
      email: customerData.email || "",
      // telephone: customerData.telephone || "",   //REMOVED FOR TESTING
      // businessDescription: customerData.business_description || "",  //REMOVED FOR TESTING
      postalAddress: {
        streetName: customerData.postal_address?.street_name || "",
        cityName: customerData.postal_address?.city_name || "",
        postalZone: customerData.postal_address?.postal_zone || "",
        country: customerData.postal_address?.country || "",
      },
    },

    // actualDeliveryDate: formatToYMD(invoice.ShipDate) || "",//REMOVED FOR TESTING
    paymentMeans: (invoice.InvoicePaymentSchedules || []).map((p) => ({
      paymentMeansCode: `${p.PaymentNumber}` || "",
      paymentDueDate: formatToYMD(p.DueDate) || "",
    })),
    paymentTermsNote: invoice.Terms || "",

    //REMOVED THIS FOR TESTING
    // allowanceCharge: [
    //   { chargeIndicator: true, amount: invoice.ChargeAmount || 0 },
    //   { chargeIndicator: false, amount: invoice.DiscountAmountAvailable || 0 },
    // ],

    taxTotal: [
      {
        taxAmount: invoice.TaxTotal || 0,
        taxSubtotal: [
          {
            taxableAmount: invoice.TaxableAmount || 0,
            taxAmount: invoice.TaxTotal || 0,
            taxCategory: {
              id: "STANDARD_VAT",
              // id: invoice.TaxGroup || "Not_Included",
              percent: invoice.TaxRate1 || 0,
            },
          },
        ],
      },
    ],

    legalMonetaryTotal: {
      lineExtensionAmount: invoice.DocumentTotalBeforeTax || 0,
      taxExclusiveAmount: invoice.DocumentTotalBeforeTax || 0,
      taxInclusiveAmount: invoice.DocumentTotalIncludingTax || 0,
      payableAmount: invoice.AmountDue || 0,
    },

    invoiceLine: lines.map((line) => ({
      hsnCode: `${line.LineNumber}` || "",
      productCategory: line.Category || line.DistributionCode || "Not_Included",
      discountRate: line.DiscountRate || 0,
      discountAmount: line.DiscountAmount || 0,
      feeRate: line.FeeRate || 0,
      feeAmount: line.FeeAmount || 0,
      invoicedQuantity: line.Quantity || 1, //ADDED ONE (1) FOR TESTING
      lineExtensionAmount: line.ExtendedAmountWithoutTIP || 0,
      item: {
        name: line.Description || "",
        description: line.Description || "",
        sellersItemIdentification: line.ItemNumber || "",
      },
      price: {
        priceAmount:
          line.DistributedAmountBeforeTaxes ||
          line.AmountDue ||
          line.Price ||
          line.ExtendedAmountWithTIP ||
          0,
        baseQuantity: line.Quantity || 1,
        priceUnit: `${invoice.CurrencyCode || ""} per 1`,
      },
    })),
  };
}

async function mapSage300ToInvoiceJsonHoptools(
  serviceId,
  firsBusinessId,
  irn,
  company,
  invoiceBatch,
  supplierData,
  customerData = {}
) {
  const invoice = invoiceBatch;
  const lines = invoice.InvoiceDetails || [];

  // ✅ Await async DB call
  const customerFirsUUID = await ensureCustomerFirsUUID(
    firsBusinessId, // supplierBusinessId
    supplierData.party_name, // supplierName
    invoice.CustomerNumber, // erp_customer_code
    customerData.party_name, // customerName
    "Sage300" // erp
  );

  return {
    businessId: firsBusinessId,
    // irn: generate300IRN(
    //   invoice.DocumentNumber || "",
    //   serviceId,
    //   invoice.DocumentDate
    // ),
    irn: irn,
    issueDate: formatToYMD(invoice.DocumentDate) || "",
    dueDate: formatToYMD(invoice.DueDate) || "",
    invoiceTypeCode: getFirsInvoiceCode(invoice.DocumentType) || "",
    note: invoice.InvoiceDescription || invoiceBatch.Description || "",
    taxPointDate: formatToYMD(invoice.DocumentDate) || "",
    documentCurrencyCode: invoice.CurrencyCode || "",
    taxCurrencyCode: invoice.CurrencyCode || "",
    accountingCost: `${invoice.DocumentTotalIncludingTax || 0} ${
      invoice.CurrencyCode || ""
    }`,
    buyerReference: invoice.CustomerNumber || "",

    //REMOVED FOR TESTING
    // invoiceDeliveryPeriod: {
    //   startDate: formatToYMD(invoiceBatch.BatchDate) || "",
    //   endDate: formatToYMD(invoiceBatch.BatchDate) || "",
    // },
    ...(formatToYMD(invoiceBatch.BatchDate)
      ? {
          invoiceDeliveryPeriod: {
            startDate: formatToYMD(invoiceBatch.BatchDate) || "",
            endDate: formatToYMD(invoiceBatch.BatchDate) || "",
          },
        }
      : {}),
    accountingSupplierParty: {
      partyName: supplierData.party_name || "",
      tin: supplierData.tin || "",
      email: supplierData.email || "",
      telephone: formatInternationalPhone(supplierData.telephone) || "",
      businessDescription: supplierData.business_description || "",
      postalAddress: supplierData.postal_address || {},
    },

    accountingCustomerParty: {
      id: customerFirsUUID || "",
      partyName: customerData.party_name || "",
      tin: customerData.tin || "",
      email: customerData.email || "",
      ...(customerData.telephone ? { telephone: customerData.telephone } : {}),
      ...(customerData.business_description
        ? { businessDescription: customerData.business_description }
        : {}),
      // telephone: customerData.telephone || "",   //REMOVED FOR TESTING
      // businessDescription: customerData.business_description || "",  //REMOVED FOR TESTING
      postalAddress: {
        streetName: customerData.postal_address?.street_name || "",
        cityName: customerData.postal_address?.city_name || "",
        postalZone: customerData.postal_address?.postal_zone || "",
        country: customerData.postal_address?.country || "",
      },
    },
    ...(formatToYMD(invoice.ShipDate)
      ? { actualDeliveryDate: formatToYMD(invoice.ShipDate) }
      : {}),
    // actualDeliveryDate: formatToYMD(invoice.ShipDate) || "",//REMOVED FOR TESTING
    paymentMeans: (invoice.InvoicePaymentSchedules || []).map((p) => ({
      paymentMeansCode: `${p.PaymentNumber}` || "",
      paymentDueDate: formatToYMD(p.DueDate) || "",
    })),
    paymentTermsNote: invoice.Terms || "",

    //REMOVED THIS FOR TESTING
    // allowanceCharge: [
    //   { chargeIndicator: true, amount: invoice.ChargeAmount || 0 },
    //   { chargeIndicator: false, amount: invoice.DiscountAmountAvailable || 0 },
    // ],

    taxTotal: [
      {
        taxAmount: invoice.TaxTotal || 0,
        taxSubtotal: [
          {
            taxableAmount: invoice.TaxableAmount || 0,
            taxAmount: invoice.TaxTotal || 0,
            taxCategory: {
              id: "STANDARD_VAT", //SET THIS FOR TESTING
              // id: invoice.TaxGroup || "Not_Included",
              percent: invoice.TaxRate1 || 0,
            },
          },
        ],
      },
    ],

    legalMonetaryTotal: {
      lineExtensionAmount: invoice.DocumentTotalBeforeTax || 0,
      taxExclusiveAmount: invoice.DocumentTotalBeforeTax || 0,
      taxInclusiveAmount: invoice.DocumentTotalIncludingTax || 0,
      payableAmount: invoice.AmountDue || 0,
    },

    invoiceLine: lines.map((line) => ({
      hsnCode: `${line.LineNumber}` || "",
      productCategory: line.Category || line.DistributionCode || "Not_Included",
      discountRate: line.DiscountRate || 0,
      discountAmount: line.DiscountAmount || 0,
      feeRate: line.FeeRate || 0,
      feeAmount: line.FeeAmount || 0,
      invoicedQuantity: line.Quantity || 1, //ADDED ONE (1) FOR TESTING
      lineExtensionAmount: line.ExtendedAmountWithoutTIP || 0,
      item: {
        name: line.Description || "",
        description: line.Description || "",
        sellersItemIdentification: line.ItemNumber || "",
      },
      price: {
        priceAmount:
          line.DistributedAmountBeforeTaxes ||
          line.AmountDue ||
          line.Price ||
          line.ExtendedAmountWithTIP ||
          0,
        baseQuantity: line.Quantity || 1,
        priceUnit: `${invoice.CurrencyCode || ""} per 1`,
      },
    })),
  };
}

//EXTERNAL RESOURCE HELPER
//EXTERNAL RESOURCE HELPER
//generate IRN
function generate300IRN(documentNumber, serviceId, documentDate) {
  console.log(serviceId);
  // Ensure date is YYYYMMDD format
  const date = new Date(documentDate);
  const formattedDate = date
    .toISOString()
    .slice(0, 10) // "YYYY-MM-DD"
    .replace(/-/g, ""); // remove dashes → "YYYYMMDD"

  return `${documentNumber.replace(
    /[^a-zA-Z0-9]/g,
    ""
  )}-${serviceId}-${formattedDate}`;
}

function safeParseJSON(str) {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    try {
      // try again if it was double-stringified
      // console.log(str);
      return str;
      // return JSON.parse(JSON.parse(str));
    } catch {
      return null;
    }
  }
}

async function getCountryCode(countryName = "") {
  if (!countryName) return "";

  try {
    const response = await fetch(
      "https://eivc-k6z6d.ondigitalocean.app/api/v1/invoice/resources/countries"
    );
    if (!response.ok) throw new Error("Failed to fetch country list");

    const json = await response.json();
    const countries = json.data || [];

    const key = countryName.trim().toLowerCase();

    // Try to find by name (case-insensitive)
    const country = countries.find((c) => c.name.toLowerCase() === key);

    // Return alpha_2 code if found, otherwise return original input
    return country ? country.alpha_2 : countryName;
  } catch (err) {
    console.error("Error fetching countries:", err);
    // fallback: return the original input
    return countryName;
  }
}

function getFirsInvoiceCode(documentType = "") {
  const map = {
    invoice: "381", // Commercial Invoice
    debitnote: "384", // Debit Note
    creditnote: "380", // Credit Note
    proforma: "390", // Proforma Invoice (if ever used)
    selfbilledinvoice: "385", // Self Billed Invoice
    selfbilledcreditnote: "393", // Self Billed Credit Note
  };

  // Normalize input (remove spaces, make lowercase)
  const normalized = documentType.toLowerCase().replace(/\s+/g, "");

  // Return mapped value or default to "381" (Commercial Invoice)
  return map[normalized] || "381";
}

function formatInternationalPhone(phone = "") {
  // Clean input (remove spaces, hyphens, and brackets)
  phone = phone.replace(/[^\d+]/g, "");

  // 1️⃣ Handle Nigerian numbers (e.g., 080, 081, 090, 070, etc.)
  if (/^0\d{10}$/.test(phone)) {
    return "+234" + phone.slice(1);
  }

  // 2️⃣ If already has + and valid international format (e.g., +44, +1, +91, etc.)
  if (/^\+\d{6,15}$/.test(phone)) {
    return phone;
  }

  // 3️⃣ If starts with country code but missing + (e.g., 2348129...)
  if (/^234\d{10}$/.test(phone)) {
    return "+234" + phone.slice(3);
  }

  // 4️⃣ If invalid
  return null;
}

function toPemFromBase64(base64Key) {
  // Decode Base64 → raw string
  const raw = Buffer.from(base64Key, "base64").toString("utf-8").trim();

  // If already in PEM format
  if (raw.includes("BEGIN PUBLIC KEY")) {
    return raw;
  }

  // Otherwise, wrap into PEM with line breaks (64 chars per line)
  return [
    "-----BEGIN PUBLIC KEY-----",
    raw.match(/.{1,64}/g).join("\n"),
    "-----END PUBLIC KEY-----",
  ].join("\n");
}

function generateInvoiceQRCode(irn, certificate, publicKeyBase64) {
  try {
    // Step 1: Append UNIX timestamp
    const timestamp = Math.floor(Date.now() / 1000);
    const irnWithTimestamp = `${irn}.${timestamp}`;

    // Step 2: Build payload JSON
    const payload = JSON.stringify({
      irn: irnWithTimestamp,
      certificate: certificate,
    });

    // Step 3: Decode Base64 public key into PEM format
    const publicKeyPem = toPemFromBase64(publicKeyBase64);
    // Step 4: Encrypt payload
    const encryptedBuffer = crypto.publicEncrypt(
      {
        key: publicKeyPem,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      Buffer.from(payload)
    );

    // Step 5: Return Base64 encrypted string
    return encryptedBuffer.toString("base64");
  } catch (err) {
    console.error("Encryption failed:", err);
    throw err;
  }
}

function formatToYMD(dateValue) {
  if (!dateValue) return "";

  const date = new Date(dateValue);

  if (isNaN(date)) return ""; // invalid date

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

//WORKFLOWS
//WORKFLOWS
//WORKFLOWS
//WORKFLOWS

//FOURTH CRON ACTION...Gets the mapped invoices from db and validate them (sucessful response still pending)
async function validateInvoices(req, res) {
  const companyRecord = await getCompanyFromApiKeyFromBearer(req);
  if (!companyRecord) {
    return res.status(403).json({
      success: false,
      message: "Invalid API key",
    });
  }

  const host = "https://dev.mbs.hoptool.co/hoptoolaccesspoint";
  const apiKey = companyRecord.firsApiKey;
  const apiSecret = companyRecord.firsClientSecret;
  const businessTin = companyRecord.TIN;
  const firs_business_id = companyRecord.firsBusinessId;

  if (!host || !apiKey || !apiSecret || !firs_business_id) {
    return res.status(400).json({
      success: false,
      message:
        "Missing required parameters (host, apiKey, apiSecret, firs_business_id)",
    });
  }

  try {
    // 1️⃣ Get invoices pending validation
    const [invoices] = await pool.query(
      `
      SELECT id, mapped_invoice, invoice_number
      FROM saved_invoices
      WHERE firs_business_id = ?
        AND mapped_status = 'done'
        AND validated_status = 'pending'
      `,
      [firs_business_id]
    );

    if (invoices.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No invoices pending validation",
      });
    }

    const results = [];
    const validateUrl = `${host}/api/v1/invoice/validate`;

    for (const inv of invoices) {
      try {
        const invoiceJson = inv.mapped_invoice;
        const validateRes = await axios.post(validateUrl, invoiceJson, {
          headers: {
            "x-api-key": apiKey,
            "x-api-secret": apiSecret,
            "business-tin": businessTin,
            "Content-Type": "application/json",
          },
          timeout: 120000,
        });

        const response = validateRes.data;
        const validated = response?.status === "SUCCESSFUL";
        console.log(response);

        // ✅ Store as JSON directly (MySQL JSON column)
        await pool.query(
          `UPDATE saved_invoices
   SET validated_status = ?, validated_response = ?
   WHERE id = ?`,
          [
            validated ? "valid" : "invalid",
            JSON.stringify(response.data),
            inv.id,
          ]
        );

        results.push({
          invoice: inv.invoice_number,
          success: validated,
          message: validated
            ? "Invoice validated successfully"
            : "Validation failed",
        });
      } catch (err) {
        // Prepare a clean JSON error object
        const errorObj = err.response?.data
          ? err.response.data
          : { message: err.message };

        await pool.query(
          `UPDATE saved_invoices
   SET validated_status = 'invalid', validated_response = ?
   WHERE id = ?`,
          [errorObj, inv.id]
        );

        results.push({
          invoice: inv.invoice_number,
          success: false,
          message: errorObj.message || "Unknown error",
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Invoice validation completed",
      results,
    });
  } catch (err) {
    console.error("❌ Error validating invoices:", err);
    return res.status(500).json({
      success: false,
      message: "Validation process failed",
      error: err.message,
    });
  }
}

//FIFTH CRON ACTION...Gets the mapped invoices from db and sign them
async function signInvoices(req, res) {
  const companyRecord = await getCompanyFromApiKeyFromBearer(req);
  if (!companyRecord) {
    return res.status(403).json({
      success: false,
      message: "Invalid API key",
    });
  }

  const host = "https://dev.mbs.hoptool.co/hoptoolaccesspoint";
  const apiKey = companyRecord.firsApiKey;
  const apiSecret = companyRecord.firsClientSecret;
  const businessTin = companyRecord.TIN;
  const firs_business_id = companyRecord.firsBusinessId;

  if (!host || !apiKey || !apiSecret || !firs_business_id) {
    return res.status(400).json({
      success: false,
      message:
        "Missing required parameters (host, apiKey, apiSecret, firs_business_id)",
    });
  }

  try {
    // 1️⃣ Get invoices that are validated but pending signing
    const [invoices] = await pool.query(
      `
      SELECT id, mapped_invoice, invoice_number
      FROM saved_invoices
      WHERE firs_business_id = ?
        AND validated_status = 'done'
        AND signed_status = 'pending'
      `,
      [firs_business_id]
    );

    if (invoices.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No invoices pending signing",
      });
    }

    const results = [];
    const signUrl = `${host}/api/v1/invoice/sign`;

    for (const inv of invoices) {
      try {
        const invoiceJson = JSON.parse(inv.mapped_invoice);
        const signRes = await axios.post(signUrl, invoiceJson, {
          headers: {
            "x-api-key": apiKey,
            "x-api-secret": apiSecret,
            "business-tin": businessTin,
            "Content-Type": "application/json",
          },
          timeout: 120000,
        });

        const response = signRes.data;
        const signed = response?.status === true;

        await pool.query(
          `
          UPDATE saved_invoices
          SET signed_status = ?, signed_response = ?
          WHERE id = ?
          `,
          [signed ? "done" : "failed", JSON.stringify(response), inv.id]
        );

        results.push({
          invoice: inv.invoice_number,
          success: signed,
          message: signed ? "Invoice signed successfully" : "Signing failed",
        });
      } catch (err) {
        await pool.query(
          `
          UPDATE saved_invoices
          SET signed_status = 'failed', signed_response = ?
          WHERE id = ?
          `,
          [JSON.stringify(err.response?.data || err.message), inv.id]
        );

        results.push({
          invoice: inv.invoice_number,
          success: false,
          message: err.response?.data?.message || err.message,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Invoice signing completed",
      results,
    });
  } catch (err) {
    console.error("❌ Error signing invoices:", err);
    return res.status(500).json({
      success: false,
      message: "Signing process failed",
      error: err.message,
    });
  }
}

// TEST AND PRESENTATION
// TEST AND PRESENTATION
// TEST AND PRESENTATION
// TEST AND PRESENTATION

async function fetchSage300BuyerInvoicesTaxes(req, res) {
  try {
    const { ERP = "Sage300", timeFrom } = req.body;
    const { server, username, password, company, firs_business_id } = req.body;

    if (!server || !company || !username || !password) {
      return res.status(400).json({
        message: "Missing required connection parameters",
      });
    }

    // Pagination variables
    const totalBatchesFetched = companyRecord.totalBatchesFetched || 0;
    let skip = totalBatchesFetched;
    const maxToFetch = 100;
    const top = 100;
    let allBatches = [];
    let hasMore = true;

    const baseUrl = `https://${server}/Sage300WebApi/v1.0/-/${encodeURIComponent(
      company
    )}/AR/ARInvoiceBatches`;

    console.log(`🔁 Fetching batches for ${company} starting at skip=${skip}`);

    while (hasMore && allBatches.length < maxToFetch) {
      const pageUrl = `${baseUrl}?$top=${top}&$skip=${skip}&$orderby=BatchNumber desc`;
      const response = await axios.get(pageUrl, {
        auth: { username, password },
        headers: { Accept: "application/json" },
        timeout: 120000,
      });

      const data = response.data;
      const current = data.value || [];

      if (current.length === 0) {
        hasMore = false;
        break;
      }

      allBatches.push(...current);
      skip += top;

      if (allBatches.length >= maxToFetch) hasMore = false;
    }

    if (allBatches.length === 0) {
      return res.status(200).json({
        message: "No new batches found",
        totalBatches: 0,
        totalInvoices: 0,
        data: [],
      });
    }

    // ✅ Extract taxes from invoices
    const taxes = [];
    for (const batch of allBatches) {
      if (!batch.Invoices || !batch.Invoices.length) continue;

      const invoicesArr = Array.isArray(batch.Invoices)
        ? batch.Invoices
        : [batch.Invoices];

      invoicesArr.forEach((inv) => {
        if (!timeFrom || new Date(inv.DocumentDate) >= new Date(timeFrom)) {
          // Only include tax info
          if (inv.TaxGroup) {
            taxes.push({
              batchId: String(batch.BatchNumber).trim(),
              entryId: String(inv.EntryNumber).trim(),
              invoice_number: (inv.DocumentNumber || "").trim(),
              taxGroup: inv.TaxGroup, // assuming this field exists
            });
          }
        }
      });
    }

    return res.status(200).json({
      message: "Fetched invoice taxes successfully",
      totalBatches: allBatches.length,
      totalInvoicesWithTaxes: taxes.length,
      data: taxes,
    });
  } catch (err) {
    console.error("❌ Error fetching AR invoice taxes:", err.message);
    return res.status(500).json({
      message: "Failed to fetch AR invoice taxes",
      error: err.response?.data || err.message,
    });
  }
}

async function fetchFromSage300(req, res, endpoint, label, account_type) {
  try {
    const {
      server,
      company,
      username,
      password,
      ERP,
      timeFrom,
      num,
      protocol,
    } = req.body;
    const { id } = req.params;

    if (!server || !company || !username || !password) {
      return res.status(400).json({
        message: "Missing required connection parameters",
      });
    }

    const basePath = id ? `${endpoint}(${id})` : endpoint;
    let baseUrl = "";
    // const baseUrl = `https://${server}/Sage300WebApi/v1.0/-/${encodeURIComponent(
    //   company
    // )}/${basePath}`;

    protocol === "http"
      ? (baseUrl = `http://${server}/Sage300WebApi/v1.0/-/${encodeURIComponent(
          company
        )}/${basePath}`)
      : (baseUrl = `https://${server}/Sage300WebApi/v1.0/-/${encodeURIComponent(
          company
        )}/${basePath}`);

    console.log(`📦 Starting fetch from Sage300: ${baseUrl}`);

    const allBatches = [];
    let skip = 0;
    const top = num;
    // const top = 100;
    let hasMore = true;

    // 1) Fetch batches (paged, newest first)
    while (hasMore) {
      const pageUrl = `${baseUrl}?$top=${top}&$skip=${skip}&$orderby=BatchNumber desc`;
      console.log(`🔁 Fetching Sage300 page: ${pageUrl}`);

      const response = await axios.get(pageUrl, {
        auth: { username, password },
        headers: { Accept: "application/json" },
        timeout: 60000,
      });

      const data = response.data;
      const current = data.value || [];

      if (!current || current.length === 0) {
        console.log("⛔ No more batches returned by API, stopping pagination.");
        break;
      }

      allBatches.push(...current);
      console.log(
        `✅ Retrieved ${current.length} batches (total: ${allBatches.length})`
      );

      // stop if last page
      if (current.length < top) {
        hasMore = false;
      } else {
        skip += top;
      }

      // respect num (num is number of batches to fetch)
      if (num && allBatches.length >= num) {
        allBatches.length = num;
        hasMore = false;
      }
    }

    // 2) Extract invoices already present inside each batch and filter by timeFrom
    const since = timeFrom ? new Date(timeFrom) : null;
    const matchedInvoices = [];

    for (const batch of allBatches) {
      if (!batch.Invoices) continue;

      // invoice container may be array or single object
      const invoicesArr = Array.isArray(batch.Invoices)
        ? batch.Invoices
        : [batch.Invoices];

      for (const inv of invoicesArr) {
        // defensive: skip if no DocumentDate
        if (!inv || !inv.DocumentDate) continue;

        if (!since || new Date(inv.DocumentDate) >= since) {
          matchedInvoices.push(inv);
        }
      }
    }

    return res.status(200).json({
      message: `Fetched ${label} invoices successfully`,
      totalBatchesFetched: allBatches.length,
      totalInvoicesMatched: matchedInvoices.length,
      data: matchedInvoices,
    });
  } catch (err) {
    console.error(
      `❌ Error fetching ${label}:`,
      err.response?.status || err.message
    );
    return res.status(500).json({
      message: `Failed to fetch ${label}`,
      error: err.response?.data || err.message,
    });
  }
}

async function fetchSage300InvoiceById(req, account_type, invoiceId) {
  const { server, company, username, password } = req.body;

  if (!server || !company || !username || !password) {
    throw new Error("Missing required connection parameters");
  }

  // invoiceId format: "BatchNumber-EntryNumber"
  const [batchId, entryId] = invoiceId.split("-");
  if (!batchId || !entryId) {
    throw new Error(
      "Invalid invoiceId format. Expected BatchNumber-EntryNumber"
    );
  }

  const endpoint =
    account_type === "AR"
      ? `AR/ARInvoiceBatches(${batchId})`
      : `AP/APInvoiceBatches(${batchId})`;

  const url = `https://${server}/Sage300WebApi/v1.0/-/${encodeURIComponent(
    company
  )}/${endpoint}`;

  try {
    const response = await axios.get(url, {
      auth: { username, password },
      headers: { Accept: "application/json" },
      timeout: 15000,
    });

    const batch = response.data;

    if (!batch || !batch.Invoices) return null;

    const invoices = Array.isArray(batch.Invoices)
      ? batch.Invoices
      : [batch.Invoices];

    const invoice = invoices.find(
      (inv) => String(inv.EntryNumber) === String(entryId)
    );

    return invoice || null;
  } catch (err) {
    console.error(
      `Error fetching ${account_type} invoice batch ${batchId}:`,
      err.response?.data || err.message
    );
    return null;
  }
}

async function fetchSage300BuyerInvoices(req, res) {
  return fetchFromSage300(req, res, "AR/ARInvoiceBatches", "AR Invoices", "AR");
}

// Supplier invoices (AP - Accounts Payable)
async function fetchSage300SupplierInvoices(req, res) {
  return fetchFromSage300(req, res, "AP/APInvoiceBatches", "AP Invoices", "AP");
}

// Customers (AR Customers)
async function fetchSage300Customers(req, res) {
  return fetchFromSage300(req, res, "AR/ARCustomers", "AR Customers");
}

// Vendors (AP Vendors)
async function fetchSage300Vendors(req, res) {
  return fetchFromSage300(req, res, "AP/APVendors", "AP Vendors");
}

async function fetchFromSage300Helper(
  { server, company, username, password, id, protocol, num },
  endpoint
) {
  // required parameters
  if (!server || !company || !username || !password) {
    throw new Error("Missing required connection parameters");
  }

  // Build resource path depending on id shape
  let basePath;
  if (id && typeof id === "object" && id.batch && id.entry) {
    // composite key style used for invoice entries
    basePath = `${endpoint}(${id.batch})(${id.entry})`;
  } else if (id) {
    // single record
    basePath = `${endpoint}(${id})`;
  } else {
    // collection
    basePath = endpoint;
  }
  let baseUrl = "";

  baseUrl =
    protocol === "http"
      ? `http://${server}/Sage300WebApi/v1.0/-/${encodeURIComponent(
          company
        )}/${basePath}`
      : `https://${server}/Sage300WebApi/v1.0/-/${encodeURIComponent(
          company
        )}/${basePath}`;

  console.log(baseUrl);

  // --- Single record fetch (unchanged behavior) ---
  if (id) {
    try {
      const response = await axios.get(baseUrl, {
        auth: { username, password },
        headers: { Accept: "application/json" },
        timeout: 15000,
      });
      return response.data;
    } catch (err) {
      // 404 -> return null (not found); other errors bubble up
      if (err.response?.status === 404) return null;
      throw err;
    }
  }

  // --- Collection fetch using $top / $skip pagination (avoid @odata.nextLink) ---
  const top = num; // page size (adjust if you need)
  //   const top = 100; // page size (adjust if you need)
  let skip = 0;
  let allData = [];

  while (true) {
    const pageUrl = `${baseUrl}?$top=${top}&$skip=${skip}`;
    console.log(`Fetching from Sage300 URL: ${pageUrl}`);
    let response;
    try {
      response = await axios.get(pageUrl, {
        auth: { username, password },
        headers: { Accept: "application/json" },
        timeout: 15000,
      });
    } catch (err) {
      // if server responds with 404 for the collection page, treat as end-of-data
      if (err.response?.status === 404) break;
      // otherwise rethrow so caller can decide (auth/network/etc.)
      throw err;
    }

    const data = response.data;

    // If the API returns paged results via `value`, append them
    if (Array.isArray(data.value) && data.value.length > 0) {
      allData.push(...data.value);
    } else if (Array.isArray(data.value) && data.value.length === 0) {
      // empty page -> end pagination
      break;
    } else if (Array.isArray(data)) {
      // some endpoints might return an array directly
      allData.push(...data);
      // if length < top, it's likely end — but continue to next page until empty
    } else if (
      data &&
      typeof data === "object" &&
      Object.keys(data).length > 0 &&
      !data.value
    ) {
      // single object returned — treat as one item then stop
      allData.push(data);
      break;
    } else {
      // no useful payload => end
      break;
    }

    // If we received fewer than `top`, that's a good sign we've reached the end
    const returnedCount = Array.isArray(data.value)
      ? data.value.length
      : Array.isArray(data)
      ? data.length
      : 1;
    if (returnedCount < top) break;

    // move to next page
    skip += top;
  }

  return allData;
}

async function fetchSage300ARInvoiceWithCustomerFirsformatted(req, res) {
  try {
    const {
      server,
      username,
      password,
      company,
      certificate,
      publicKey,
      serviceId,
      firs_business_id,
      party_name,
      tin,
      email,
      telephone,
      postal_address,
      country,
      protocol,
      num,
    } = req.body;
    const { batchId, entryId } = req.params;

    const host = "https://dev.mbs.hoptool.co/hoptoolaccesspoint";
    const apiKey = req.body.firsApiKey;
    const apiSecret = req.body.firsClientSecret;
    const companyTin = tin;
    const companyRecord = {
      name: party_name || "Default Supplier",
      tin: tin,
      email: email,
      telephone: telephone,
      address: postal_address,
      business_description: "",
      city: "",
      country: country || "",
    };
    // companyRecord.firsBusinessId might already exist; we'll update it if FIRS returns a businessId
    if (!host || !apiKey || !apiSecret) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameters (host, apiKey, apiSecret)",
      });
    }

    const batch = await fetchFromSage300Helper(
      { server, company, username, password, id: batchId, protocol, num },
      "AR/ARInvoiceBatches"
    );

    if (!batch || !batch.Invoices) {
      retdddtus(404).json({
        success: false,
        message: "Invoice batch not found",
        errorCode: "BATCH_NOT_FOUND",
      });
    }

    const invoices = Array.isArray(batch.Invoices)
      ? batch.Invoices
      : [batch.Invoices];
    const invoice = invoices.find(
      (inv) => String(inv.EntryNumber) === String(entryId)
    );

    if (!invoice) {
      retdddtus(404).json({
        success: false,
        message: "Invoice not found in batch",
        errorCode: "INVOICE_NOT_FOUND",
      });
    }

    let customer = null;
    if (invoice.CustomerNumber) {
      customer = await fetchFromSage300Helper(
        {
          server,
          company,
          username,
          password,
          id: `'${invoice.CustomerNumber}'`,
          protocol,
        },
        "AR/ARCustomers"
      );
    }

    const generateIrnUrl = `${host}/api/v1/invoice/generate-irn?reference=${invoice.DocumentNumber}`;

    console.log(generateIrnUrl);

    const generateRes = await axios.get(generateIrnUrl, {
      headers: {
        "x-api-key": apiKey,
        "x-api-secret": apiSecret,
        "business-tin": companyTin,
        "Content-Type": "application/json",
      },
      timeout: 120000,
    });

    const dataIrn = generateRes?.data;

    // Map into standard invoice JSON
    const invoiceJson = await mapSage300ToInvoiceJsonTest(
      serviceId,
      dataIrn.data.irn,
      firs_business_id,
      companyRecord,
      batch,
      {
        party_name: companyRecord.name,
        tin: companyRecord.tin,
        email: companyRecord.email,
        telephone: companyRecord.telephone,
        business_description: companyRecord.business_description || "",
        postal_address: {
          streetName: companyRecord.postal_address,
          cityName: companyRecord.city,
          postalZone: "",
          // postal_zone: companyRecord.zip_code,
          country: await getCountryCode(companyRecord.country),
        },
      },
      customer
        ? {
            party_name: customer.CustomerName,
            tin:
              customer.TaxRegistrationNumber1 ||
              customer.TaxRegistrationNumber2 ||
              customer.TaxRegistrationNumber3 ||
              customer.TaxRegistrationNumber4 ||
              customer.TaxRegistrationNumber5 ||
              "",
            email: customer.Email,
            telephone: formatInternationalPhone(customer.PhoneNumber),
            business_description: customer.Description,
            postal_address: {
              street_name:
                [
                  customer.AddressLine1,
                  customer.AddressLine2,
                  customer.AddressLine3,
                  customer.AddressLine4,
                ]
                  .filter((line) => line && line.trim() !== "")
                  .join(", ")
                  .trim() || null,

              city_name: (customer.City || "").trim() || null,
              postal_zone: (customer.ZipPostalCode || "").trim() || null,
              country:
                (await getCountryCode(customer.Country || "")) ||
                (customer.Country || "").trim(),
            },
          }
        : {}
    );

    // Generate encrypted payload + QR code
    // const encryptedBase64 = generateInvoiceQRCode(
    //   invoiceJson.irn,
    //   certificate,
    //   publicKey
    // );
    // const qrDataUrl = await QRCode.toDataURL(encryptedBase64);

    return res.status(200).json({
      success: true,
      message: "Fetched AR Invoice with Customer",
      data: {
        invoice: invoiceJson,
        // encryptedBase64,
        // qrDataUrl,
      },
    });
  } catch (err) {
    console.error("Error in fetchSage300ARInvoiceWithCustomer:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch AR Invoice with Customer",
      errorCode: "SERVER_ERROR",
      details: err.message,
    });
  }
}

async function fetchSage300ARInvoiceWithCustomerFirsformattedAndSign(req, res) {
  try {
    const {
      server,
      username,
      password,
      company,
      certificate,
      publicKey,
      serviceId,
      firs_business_id,
      party_name,
      tin,
      email,
      telephone,
      postal_address,
      country,
      protocol,
      num,
      business_description,
    } = req.body;
    const { batchId, entryId } = req.params;

    const host = "https://dev.mbs.hoptool.co/hoptoolaccesspoint";
    const apiKey = req.body.firsApiKey;
    const apiSecret = req.body.firsClientSecret;
    const companyTin = tin;
    const companyRecord = {
      name: party_name || "Default Supplier",
      tin: tin,
      email: email,
      telephone: telephone,
      address: postal_address,
      business_description: business_description,
      city: "",
      country: country || "",
    };

    if (!host || !apiKey || !apiSecret) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameters (host, apiKey, apiSecret)",
      });
    }

    const batch = await fetchFromSage300Helper(
      { server, company, username, password, id: batchId, protocol, num },
      "AR/ARInvoiceBatches"
    );

    if (!batch || !batch.Invoices) {
      return res.status(404).json({
        success: false,
        message: "Invoice batch not found",
        errorCode: "BATCH_NOT_FOUND",
      });
    }

    const invoices = Array.isArray(batch.Invoices)
      ? batch.Invoices
      : [batch.Invoices];
    const invoice = invoices.find(
      (inv) => String(inv.EntryNumber) === String(entryId)
    );

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found in batch",
        errorCode: "INVOICE_NOT_FOUND",
      });
    }

    let customer = null;
    if (invoice.CustomerNumber) {
      customer = await fetchFromSage300Helper(
        {
          server,
          company,
          username,
          password,
          id: `'${invoice.CustomerNumber}'`,
          protocol,
        },
        "AR/ARCustomers"
      );
    }

    const generateIrnUrl = `${host}/api/v1/invoice/generate-irn?reference=${invoice.DocumentNumber}`;

    const generateRes = await axios.get(generateIrnUrl, {
      headers: {
        "x-api-key": apiKey,
        "x-api-secret": apiSecret,
        "business-tin": companyTin,
        "Content-Type": "application/json",
      },
      timeout: 120000,
    });

    const dataIrn = generateRes?.data;

    // Map into standard invoice JSON
    const invoiceJson = await mapSage300ToInvoiceJsonTest(
      serviceId,
      dataIrn.data.irn,
      firs_business_id,
      companyRecord,
      batch,
      {
        party_name: companyRecord.name,
        tin: companyRecord.tin,
        email: companyRecord.email,
        telephone: companyRecord.telephone,
        business_description: companyRecord.business_description || "",
        postal_address: {
          streetName: companyRecord.address,
          cityName: companyRecord.city,
          postalZone: "",
          country: await getCountryCode(companyRecord.country),
        },
      },
      customer
        ? {
            party_name: customer.CustomerName,
            tin:
              customer.TaxRegistrationNumber1 ||
              customer.TaxRegistrationNumber2 ||
              customer.TaxRegistrationNumber3 ||
              customer.TaxRegistrationNumber4 ||
              customer.TaxRegistrationNumber5 ||
              "",
            email: customer.Email,
            telephone: formatInternationalPhone(customer.PhoneNumber),
            business_description: customer.Description,
            postal_address: {
              street_name:
                [
                  customer.AddressLine1,
                  customer.AddressLine2,
                  customer.AddressLine3,
                  customer.AddressLine4,
                ]
                  .filter((line) => line && line.trim() !== "")
                  .join(", ")
                  .trim() || null,
              city_name: (customer.City || "").trim() || null,
              postal_zone: (customer.ZipPostalCode || "").trim() || null,
              country:
                (await getCountryCode(customer.Country || "")) ||
                (customer.Country || "").trim(),
            },
          }
        : {}
    );

    // ✅ --- FIRS validation and signing ---
    let validated = false;
    let signed = false;
    let validationResponse = null;
    let signResponse = null;
    const results = [];

    try {
      // Validate invoice
      const validateRes = await axios.post(
        `${host}/api/v1/invoice/validate`,
        invoiceJson,
        {
          headers: {
            "x-api-key": apiKey,
            "x-api-secret": apiSecret,
            "business-tin": companyTin,
            "Content-Type": "application/json",
          },
          timeout: 120000,
        }
      );
      validationResponse = validateRes.data;
      validated = validateRes.data?.status === "SUCCESSFUL";
      results.push({
        invoice: invoice.DocumentNumber,
        customer: invoice.CustomerNumber,
        stage: "validation",
        success: validated,
        response: validationResponse,
      });
    } catch (err) {
      results.push({
        invoice: invoice.DocumentNumber,
        customer: invoice.CustomerNumber,
        stage: "validation",
        success: false,
        message: err.response?.data?.message || err.message,
      });
    }

    if (validated) {
      try {
        const signRes = await axios.post(
          `${host}/api/v1/invoice/sign`,
          invoiceJson,
          {
            headers: {
              "x-api-key": apiKey,
              "x-api-secret": apiSecret,
              "business-tin": companyTin,
              "Content-Type": "application/json",
            },
            timeout: 120000,
          }
        );
        signResponse = signRes.data;
        signed = signRes.data?.status === "SUCCESSFUL";
        results.push({
          invoice: invoice.DocumentNumber,
          customer: invoice.CustomerNumber,
          stage: "sign",
          success: signed,
          response: signResponse,
        });
      } catch (err) {
        results.push({
          invoice: invoice.DocumentNumber,
          customer: invoice.CustomerNumber,
          stage: "sign",
          success: false,
          message: err.response?.data?.message || err.message,
        });
      }
    }

    // ✅ Return final response including validation & signing results
    return res.status(200).json({
      //   success: true,
      //   message: "Fetched, validated, and signed AR invoice with Customer",
      data: {
        // invoice: invoiceJson,
        results,
      },
    });
  } catch (err) {
    console.error(
      "Error in fetchSage300ARInvoiceWithCustomerFirsformattedAndSign:",
      err
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch, validate, or sign AR Invoice",
      errorCode: "SERVER_ERROR",
      details: err.message,
    });
  }
}

async function fetchSage300ARInvoiceWithCustomerFirsformattedAndSignResolve(
  req,
  res
) {
  try {
    const {
      server,
      username,
      password,
      company,
      certificate,
      publicKey,
      serviceId,
      firs_business_id,
      party_name,
      tin,
      email,
      telephone,
      postal_address,
      country,
      protocol,
      num,
      business_description,
    } = req.body;
    const { batchId, entryId } = req.params;

    const host = "https://dev.mbs.hoptool.co/hoptoolaccesspoint";
    const apiKey = req.body.firsApiKey;
    const apiSecret = req.body.firsClientSecret;
    const companyTin = tin;
    const companyRecord = {
      name: party_name || "Default Supplier",
      tin: tin,
      email: email,
      telephone: telephone,
      address: postal_address,
      business_description: business_description,
      city: "",
      country: country || "",
    };

    if (!host || !apiKey || !apiSecret) {
      return res.status(400).json({
        success: false,
        message: "Missing required parameters (host, apiKey, apiSecret)",
      });
    }

    const batch = await fetchFromSage300Helper(
      { server, company, username, password, id: batchId, protocol, num },
      "AR/ARInvoiceBatches"
    );

    if (!batch || !batch.Invoices) {
      return res.status(404).json({
        success: false,
        message: "Invoice batch not found",
        errorCode: "BATCH_NOT_FOUND",
      });
    }

    const invoices = Array.isArray(batch.Invoices)
      ? batch.Invoices
      : [batch.Invoices];
    const invoice = invoices.find(
      (inv) => String(inv.EntryNumber) === String(entryId)
    );

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found in batch",
        errorCode: "INVOICE_NOT_FOUND",
      });
    }

    let customer = null;
    if (invoice.CustomerNumber) {
      customer = await fetchFromSage300Helper(
        {
          server,
          company,
          username,
          password,
          id: `'${invoice.CustomerNumber}'`,
          protocol,
        },
        "AR/ARCustomers"
      );
    }

    const generateIrnUrl = `${host}/api/v1/invoice/generate-irn?reference=${invoice.DocumentNumber}`;

    const generateRes = await axios.get(generateIrnUrl, {
      headers: {
        "x-api-key": apiKey,
        "x-api-secret": apiSecret,
        "business-tin": companyTin,
        "Content-Type": "application/json",
      },
      timeout: 120000,
    });

    const dataIrn = generateRes?.data;

    // Map into standard invoice JSON
    const invoiceJson = await mapSage300ToInvoiceJsonTest(
      serviceId,
      dataIrn.data.irn,
      firs_business_id,
      companyRecord,
      batch,
      {
        party_name: companyRecord.name,
        tin: companyRecord.tin,
        email: companyRecord.email,
        telephone: companyRecord.telephone,
        business_description: companyRecord.business_description || "",
        postal_address: {
          streetName: companyRecord.address,
          cityName: companyRecord.city,
          postalZone: "",
          country: await getCountryCode(companyRecord.country),
        },
      },
      customer
        ? {
            party_name: customer.CustomerName,
            tin:
              customer.TaxRegistrationNumber1 ||
              customer.TaxRegistrationNumber2 ||
              customer.TaxRegistrationNumber3 ||
              customer.TaxRegistrationNumber4 ||
              customer.TaxRegistrationNumber5 ||
              "1234567890",
            email:
              customer.Email ||
              `${customer.CustomerName.replace(
                /\s+/g,
                ""
              ).toLowerCase()}@example.com`,
            telephone: formatInternationalPhone(customer.PhoneNumber),
            business_description: customer.Description,
            postal_address: {
              street_name:
                [
                  customer.AddressLine1,
                  customer.AddressLine2,
                  customer.AddressLine3,
                  customer.AddressLine4,
                ]
                  .filter((line) => line && line.trim() !== "")
                  .join(", ")
                  .trim() || null,
              city_name: (customer.City || "").trim() || null,
              postal_zone: (customer.ZipPostalCode || "").trim() || null,
              country:
                (await getCountryCode(customer.Country || "")) ||
                (customer.Country || "").trim() ||
                "NG",
            },
          }
        : {}
    );

    // ✅ --- FIRS validation and signing ---
    let validated = false;
    let signed = false;
    let validationResponse = null;
    let signResponse = null;
    const results = [];

    try {
      // Validate invoice
      const validateRes = await axios.post(
        `${host}/api/v1/invoice/validate`,
        invoiceJson,
        {
          headers: {
            "x-api-key": apiKey,
            "x-api-secret": apiSecret,
            "business-tin": companyTin,
            "Content-Type": "application/json",
          },
          timeout: 120000,
        }
      );
      validationResponse = validateRes.data;
      validated = validateRes.data?.status === "SUCCESSFUL";
      results.push({
        invoice: invoice.DocumentNumber,
        customer: invoice.CustomerNumber,
        stage: "validation",
        success: validated,
        response: validationResponse,
      });
    } catch (err) {
      results.push({
        invoice: invoice.DocumentNumber,
        customer: invoice.CustomerNumber,
        stage: "validation",
        success: false,
        message: err.response?.data?.message || err.message,
      });
    }

    if (validated) {
      try {
        const signRes = await axios.post(
          `${host}/api/v1/invoice/sign`,
          invoiceJson,
          {
            headers: {
              "x-api-key": apiKey,
              "x-api-secret": apiSecret,
              "business-tin": companyTin,
              "Content-Type": "application/json",
            },
            timeout: 120000,
          }
        );
        signResponse = signRes.data;
        signed = signRes.data?.status === "SUCCESSFUL";
        results.push({
          invoice: invoice.DocumentNumber,
          customer: invoice.CustomerNumber,
          stage: "sign",
          success: signed,
          response: signResponse,
        });
      } catch (err) {
        results.push({
          invoice: invoice.DocumentNumber,
          customer: invoice.CustomerNumber,
          stage: "sign",
          success: false,
          message: err.response?.data?.message || err.message,
        });
      }
    }

    // ✅ Return final response including validation & signing results
    return res.status(200).json({
      //   success: true,
      //   message: "Fetched, validated, and signed AR invoice with Customer",
      data: {
        // invoice: invoiceJson,
        results,
      },
    });
  } catch (err) {
    console.error(
      "Error in fetchSage300ARInvoiceWithCustomerFirsformattedAndSign:",
      err
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch, validate, or sign AR Invoice",
      errorCode: "SERVER_ERROR",
      details: err.message,
    });
  }
}

//new function to be used for mapping pulled invoices and updating the table
//new function to be used for mapping pulled invoices and updating the table
//new function to be used for mapping pulled invoices and updating the table

// ✅ Fetch AP Invoice + Vendor ---not updated
async function fetchSage300APInvoiceWithVendorFirsformatted(req, res) {
  try {
    const companyRecord = await getCompanyFromApiKeyFromBearer(req);
    if (!companyRecord) {
      return res.status(403).json({
        success: false,
        message: "Invalid API key",
        errorCode: "AUTH_INVALID_KEY",
      });
    }

    const {
      server,
      username,
      password,
      company,
      certificate,
      publicKey,
      serviceId,
      firsBusinessId,
    } = req.body;
    const { batchId, entryId } = req.params;

    const batch = await fetchFromSage300Helper(
      { server, company, username, password, id: batchId },
      "AP/APInvoiceBatches"
    );

    if (!batch || !batch.Invoices) {
      return res.status(404).json({
        success: false,
        message: "Invoice batch not found",
        errorCode: "BATCH_NOT_FOUND",
      });
    }

    const invoices = Array.isArray(batch.Invoices)
      ? batch.Invoices
      : [batch.Invoices];
    const invoice = invoices.find(
      (inv) => String(inv.EntryNumber) === String(entryId)
    );

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found in batch",
        errorCode: "INVOICE_NOT_FOUND",
      });
    }

    let vendor = null;
    if (invoice.VendorNumber) {
      vendor = await fetchFromSage300Helper(
        {
          server,
          company,
          username,
          password,
          id: `'${invoice.VendorNumber}'`,
        },
        "AP/APVendors"
      );
    }

    // Map into standard invoice JSON
    const invoiceJson = mapSage300ToInvoiceJson(
      serviceId,
      firsBusinessId,
      companyRecord,
      batch,
      vendor
        ? {
            party_name: vendor.VendorName,
            tin: vendor.TIN,
            email: vendor.Email,
            telephone: vendor.Telephone,
            business_description: vendor.Description,
            postal_address: {
              street_name: vendor.Address1,
              city_name: vendor.City,
              postal_zone: vendor.PostalCode,
              country: await getCountryCode(vendor.Country),
            },
          }
        : {},
      {
        party_name: companyRecord.name,
        tin: companyRecord.TIN,
        email: companyRecord.email,
        telephone: companyRecord.phone,
        business_description: companyRecord.business_description,
        postal_address: {
          street_name: companyRecord.postal_address,
          city_name: companyRecord.city,
          postal_zone: companyRecord.zip_code,
          country: await getCountryCode(companyRecord.country),
        },
      }
    );

    // Generate encrypted payload + QR code
    const encryptedBase64 = generateInvoiceQRCode(
      invoiceJson.irn,
      certificate,
      publicKey
    );
    const qrDataUrl = await QRCode.toDataURL(encryptedBase64);

    return res.status(200).json({
      success: true,
      message: "Fetched AP Invoice with Vendor",
      data: {
        invoice: invoiceJson,
        encryptedBase64,
        qrDataUrl,
      },
    });
  } catch (err) {
    console.error("Error in fetchSage300APInvoiceWithVendor:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch AP Invoice with Vendor",
      errorCode: "SERVER_ERROR",
      details: err.message,
    });
  }
}

module.exports = {
  fetchSage300BuyerInvoices,
  fetchSage300ARInvoiceWithCustomerFirsformatted,
  fetchSage300ARInvoiceWithCustomerFirsformattedAndSign,
  fetchSage300ARInvoiceWithCustomerFirsformattedAndSignResolve,
};
