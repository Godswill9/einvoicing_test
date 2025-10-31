const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const forge = require("node-forge");
const QRCode = require("qrcode");
const crypto = require("crypto");
const https = require("https");
const http = require("http");
const agent = new https.Agent({ rejectUnauthorized: false });

function buildUrl(
  protocol,
  server,
  port,
  environment,
  endpoint,
  view,
  id,
  countParam
) {
  // Special case: SINVOICEV with id → use EDISIHTR.$details representation
  if (id && endpoint.toUpperCase() === "SINVOICEV") {
    return `${protocol}://${server}:${port}/sdata/x3/erp/${encodeURIComponent(
      environment
    )}/${endpoint}('${id}')?representation=EDISIHTR.$details`;
  }
  if (id && endpoint.toUpperCase() === "PINVOICE") {
    return `${protocol}://${server}:${port}/sdata/x3/erp/${encodeURIComponent(
      environment
    )}/${endpoint}('${id}')?representation=PINVOICE.$details`;
  }

  // If id is provided and view is "$details"
  if (id && view === "$details") {
    return `${protocol}://${server}:${port}/sdata/x3/erp/${encodeURIComponent(
      environment
    )}/${endpoint}('${id}')?representation=${endpoint}.${view}`;
  }

  // If id is provided but not details view
  if (id) {
    return `${protocol}://${server}:${port}/sdata/x3/erp/${encodeURIComponent(
      environment
    )}/${endpoint}?representation=${endpoint}.${view}&where=NUM eq '${id}'`;
  }

  // Default query without id
  return `${protocol}://${server}:${port}/sdata/x3/erp/${encodeURIComponent(
    environment
  )}/${endpoint}?representation=${endpoint}.${view}${countParam}`;
}

// Helper function: fetch data (handles paging + malformed JSON)
async function getSageData(queryUrl, protocol, username, password, num, label) {
  let allResults = [];
  let nextUrl = queryUrl;
  const agent =
    protocol === "https"
      ? new https.Agent({ rejectUnauthorized: false })
      : new http.Agent();
  do {
    const response = await axios.get(nextUrl, {
      auth: { username, password },
      headers: { Accept: "application/json" },
      httpAgent: protocol === "http" ? agent : undefined,
      httpsAgent: protocol === "https" ? agent : undefined,
      timeout: 60000,
    });

    let result = response.data;
    if (typeof result === "string") {
      try {
        result = JSON.parse(result);
      } catch {
        const cleaned = result.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
        result = JSON.parse(cleaned);
      }
    }

    // ✅ Normal list case
    if (result.$resources) {
      allResults.push(...result.$resources);
    }
    // ✅ Single record case (details view)
    else if (result.NUM || result.$uuid) {
      allResults.push(result);
    }

    if (num === "all" && result.$links && result.$links.$next?.$url) {
      nextUrl = result.$links.$next.$url;
      console.log("Fetching next page:", nextUrl);
    } else {
      nextUrl = null;
    }
  } while (nextUrl);

  console.log(`✅ Total fetched for ${label}: ${allResults.length}`);
  return { total: allResults.length, data: allResults };
}

async function fetchFromSageX3(req, res, endpoint, label) {
  try {
    const {
      server,
      port,
      environment,
      username,
      password,
      id,
      viewType,
      num,
      protocol = "http", // default to http if not provided
    } = req.body;

    if (!server || !port || !environment || !username || !password) {
      return res.status(400).json({
        message: "Missing required connection parameters",
      });
    }

    const view = viewType || "$query";
    const countParam = num && num !== "all" ? `&count=${num}` : "&count=20";

    // Build URL and fetch once using the specified protocol only
    const queryUrl = buildUrl(
      protocol,
      server,
      port,
      environment,
      endpoint,
      view,
      id,
      countParam
    );

    console.log(`Fetching (${protocol.toUpperCase()}):`, queryUrl);

    // Try once with the specified protocol
    const results = await getSageData(
      queryUrl,
      protocol,
      username,
      password,
      num,
      label
    );

    return res.json(results);
  } catch (err) {
    console.error(`❌ Fatal error fetching ${label}:`, err.message);
    res.status(500).json({
      message: `Failed to fetch ${label}`,
      error: err.message,
    });
  }
}

async function fetchSageX3CustomerInvoices(req, res) {
  return fetchFromSageX3(req, res, "SINVOICEV", "invoices"); //working
}

function formatParty(raw) {
  return {
    id: raw.BPS_BPA_BPANUM || raw.BPCNUM || raw.BPR || "",
    party_name: raw.BPCNAM || raw.BPRNAM || "Unknown",
    tin: raw.CRN || "TIN-000001",
    email: raw.EMAIL || "",
    telephone: raw.TEL || raw.BPS_BPA_TELEPHONE || "",
    business_description: raw.BPRLOG || "",
    postal_address: {
      street_name: raw.BPAADDLIG1 || "",
      city_name: raw.CTY || "",
      postal_zone: raw.POSCOD || "",
      country: raw.CRYNAM || "",
    },
  };
}

function buildEnvSupplier(company) {
  return {
    name: company?.name || "",
    tin: company?.TIN || "",
    email: company?.email || "",
    telephone: company?.phone || "",
    description: company?.business_description || "",
    address: {
      street_name: company?.street_name || "",
      city_name: company?.city || "",
      postal_zone: company?.zip_code || "",
      country: company?.country || "",
    },
  };
}

function buildEnvCustomer(company) {
  return {
    name: company?.name || "",
    tin: company?.TIN || "",
    email: company?.email || "",
    telephone: company?.phone || "",
    description: company?.business_description || "",
    address: {
      street_name: company?.street_name || "",
      city_name: company?.city || "",
      postal_zone: company?.zip_code || "",
      country: company?.country || "",
    },
  };
}

async function fetchAndMapInvoice({ req, res, type }) {
  try {
    const {
      server,
      port,
      environment,
      username,
      password,
      serviceId,
      certificate,
      publicKey,
      protocol = "http",
      party_name,
      tin,
      email,
      telephone,
      postal_address,
    } = req.body;
    const { invoiceId } = req.params;

    if (
      !server ||
      !port ||
      !environment ||
      !username ||
      !password ||
      !invoiceId
    ) {
      return res
        .status(400)
        .json({ message: "❌ Missing required parameters" });
    }

    const baseUrl = `${protocol}://${server}:${port}/sdata/x3/erp/${encodeURIComponent(
      environment
    )}`;

    // ✅ Use correct representation for SINVOICEV
    const representation = type === "SINVOICEV" ? "EDISIHTR" : type;

    let invoiceUrl = `${baseUrl}/${type}('${encodeURIComponent(
      invoiceId
    )}')?representation=${representation}.$details`;

    console.log(invoiceUrl);
    let invoiceResp;
    try {
      invoiceResp = await axios.get(invoiceUrl, {
        auth: { username, password },
        headers: {
          Accept: "application/json",
          "X-Requested-With": "stateless",
        },
        httpsAgent: agent,
        timeout: 30000,
      });
    } catch (err) {
      // 🔁 Fallback to .$query if .$details fails
      if (err.response?.status === 400 || err.response?.status === 500) {
        console.warn("⚠️ $details not allowed, retrying with $query...");
        invoiceUrl = `${baseUrl}/${type}('${encodeURIComponent(
          invoiceId
        )}')?representation=${representation}.$query`;

        invoiceResp = await axios.get(invoiceUrl, {
          auth: { username, password },
          headers: {
            Accept: "application/json",
            "X-Requested-With": "stateless",
          },
          httpsAgent: agent,
        });
      } else throw err;
    }

    const invoiceData = invoiceResp?.data;
    if (!invoiceData) {
      return res
        .status(404)
        .json({ message: `${type} invoice ${invoiceId} not found` });
    }

    invoiceData.lines = Array.isArray(invoiceData.lines)
      ? invoiceData.lines
      : [];

    // 🧾 Party details
    let customerData = {};
    let supplierData = {};
    supplierData = {
      name: party_name || "Default Supplier",
      tin: tin,
      email: email,
      telephone: telephone,
      address: postal_address,
    };

    //   supplierData = buildEnvSupplier({});
    if (type === "SINVOICEV") {
      const customerCode = invoiceData.BPCINV;
      if (customerCode) {
        const customerUrl = `${baseUrl}/BPCUSTOMER('${encodeURIComponent(
          customerCode
        )}')?representation=BPCUSTOMER.$details`;

        console.log(customerUrl);
        try {
          const customerResp = await axios.get(customerUrl, {
            auth: { username, password },
            headers: {
              Accept: "application/json",
              "X-Requested-With": "stateless",
            },
            httpsAgent: agent,
          });

          customerData = customerResp?.data
            ? formatParty(customerResp.data)
            : buildEnvCustomer();
        } catch {
          customerData = buildEnvCustomer();
        }
      } else customerData = buildEnvCustomer();
    } else if (type === "PINVOICE") {
      const supplierCode = invoiceData.BPR || invoiceData.BPSINV;
      if (supplierCode) {
        const supplierUrl = `${baseUrl}/BPSUPPLIER('${encodeURIComponent(
          supplierCode
        )}')?representation=BPSUPPLIER.$details`;

        try {
          const supplierResp = await axios.get(supplierUrl, {
            auth: { username, password },
            headers: {
              Accept: "application/json",
              "X-Requested-With": "stateless",
            },
            httpsAgent: agent,
          });

          supplierData = supplierResp?.data
            ? formatParty(supplierResp.data)
            : buildEnvSupplier();
        } catch {
          supplierData = buildEnvSupplier();
        }
      } else supplierData = buildEnvSupplier();

      customerData = buildEnvCustomer({});
    }

    // 🧩 Map invoice data
    const mapper =
      type === "SINVOICEV"
        ? mapSageX3ToInvoiceJsonSinvoice
        : mapSageX3ToInvoiceJsonPinvoice;

    const mappedInvoice = mapper(
      serviceId,
      invoiceData,
      customerData,
      supplierData
    );

    return res.status(200).json({
      success: true,
      // data: { invoice: mappedInvoice },
      data: { invoice: mappedInvoice },
    });
  } catch (err) {
    console.error("❌ Error in fetchAndMapInvoice:", err.message);
    return res.status(500).json({
      message: "Unexpected error",
      error: err.response?.data || err.message,
    });
  }
}

function generateIRN(invoiceNumber, serviceId, issueDate) {
  const cleanInvoiceNumber = (invoiceNumber || "")
    .toString()
    .replace(/[^a-zA-Z0-9]/g, "");
  const dateStamp = issueDate ? issueDate.replace(/-/g, "") : "";
  return `${cleanInvoiceNumber}-${serviceId}-${dateStamp}`;
}

function mapSageX3ToInvoiceJsonSinvoice(
  serviceId,
  invoiceData,
  customerData,
  supplierData
) {
  return {
    business_id: invoiceData.$uuid || "",
    irn: generateIRN(
      invoiceData.NUMBIS || invoiceData.NUM || "",
      serviceId,
      invoiceData.INVDAT || ""
    ),
    issue_date: invoiceData.INVDAT || "",
    due_date: invoiceData.CREDITMEMDAT || "", // Or set to terms-based date if needed
    invoice_type_code: invoiceData.BPAINV || "", // e.g., A01
    note: invoiceData.PTE || "", // Payment term note
    tax_point_date: invoiceData.INVDAT || "",
    document_currency_code: invoiceData.CUR || "",
    tax_currency_code: invoiceData.CUR || "",
    accounting_cost: `${invoiceData.AMTATI || 0} ${invoiceData.CUR || ""}`,
    buyer_reference: invoiceData.BPCINV || "",
    invoice_delivery_period: {
      start_date: invoiceData.REALDATE || "",
      end_date: invoiceData.CREDITMEMDAT || "",
    },

    // Supplier
    accounting_supplier_party: supplierData || {
      party_name: invoiceData.CPY_REF?.$title || "",
      tin: invoiceData.CPYCRN || "",
      email: "",
      telephone: "",
      business_description: invoiceData.CPY_REF || "",
      postal_address: {
        street_name: invoiceData.CPYADD || "",
        city_name: invoiceData.CPYCTY || "",
        postal_zone: invoiceData.CPYPOSCOD || "",
        country: invoiceData.CPYCRY || "",
      },
    },

    // Customer
    accounting_customer_party: customerData || {
      id: invoiceData.BPCINV || "",
      party_name: invoiceData.BPCINV_REF?.$title || "",
      tin: invoiceData.BPVATNUM || "",
      email: "",
      telephone: "",
      business_description: invoiceData.BPCINV_REF?.$description || "",
      postal_address: {
        street_name: invoiceData.BPDADDLIG1 || "",
        city_name: invoiceData.BPDCTY || "",
        postal_zone: invoiceData.BPDPOSCOD || "",
        country: invoiceData.BPDCRY_REF?.$title || "",
      },
    },

    actual_delivery_date: invoiceData.REALDATE || "",
    payment_means: [
      {
        payment_means_code: "10",
        payment_due_date: invoiceData.CREDITMEMDAT || "",
      },
    ],
    payment_terms_note: invoiceData.PTE || "",

    // Charges / Discounts
    allowance_charge: [
      { charge_indicator: true, amount: 0 },
      { charge_indicator: false, amount: 0 },
    ],

    // Tax Totals
    tax_total: [
      {
        tax_amount:
          invoiceData.SIVSVV?.[0]?.SVVVATAMT || invoiceData.AMTTAX1 || 0,
        tax_subtotal: (invoiceData.SIVSVV || []).map((tax) => ({
          taxable_amount: tax.SVVBASTAX || 0,
          tax_amount: tax.SVVVATAMT || 0,
          tax_category: {
            id: tax.SVVVAT_REF?.$title || "LOCAL_SALES_TAX",
            percent: tax.SVVVATRAT || 0,
          },
        })),
      },
    ],

    // Totals
    legal_monetary_total: {
      line_extension_amount: invoiceData.AMTNOT || 0,
      tax_exclusive_amount: invoiceData.AMTNOT || 0,
      tax_inclusive_amount: invoiceData.AMTATI || 0,
      payable_amount: invoiceData.AMTATI || 0,
    },

    // Invoice lines
    invoice_line: (invoiceData.SIVSID || []).map((line, index) => ({
      line_number: line.SIDLIN || index + 1,
      hsn_code: line.ITMREF || "",
      product_category: line.ITMREF_REF?.$description || "",
      discount_rate: line.DISCRGVAL1 || 0,
      discount_amount: line.DISCRGVAL1
        ? (line.DISCRGVAL1 / 100) * line.NETPRI
        : 0,
      invoiced_quantity: line.QTY || 0,
      line_extension_amount: line.AMTNOTLIN || 0,
      item: {
        name: line.ITMDES || "",
        description: line.ITMREF_REF?.$description || line.ITMDES || "",
        sellers_item_identification: line.ITMREF || "",
      },
      price: {
        price_amount: line.NETPRI || 0,
        base_quantity: line.QTY || 1,
        price_unit: `${invoiceData.CUR || ""} per ${
          line.SAU_REF?.$title || "unit"
        }`,
      },
      tax: {
        code: line.SIVSIDC_VAT?.[0]?.VATLIN || "",
        rate: line.RATTAXLIN || 0,
      },
    })),
  };
}

async function fetchSageX3SalesInvoiceMapped(req, res) {
  return fetchAndMapInvoice({
    req,
    res,
    type: "SINVOICEV", // sales
    partyRole: "supplier", // we are supplier
  });
}

module.exports = {
  fetchSageX3CustomerInvoices,
  fetchSageX3SalesInvoiceMapped,
};
