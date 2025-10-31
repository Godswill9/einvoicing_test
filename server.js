// require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const https = require("https");

const cors = require("cors"); // 👈 install: npm install cors
const {
  fetchSage300BuyerInvoices,
  fetchSage300ARInvoiceWithCustomerFirsformatted,
} = require("./sage_300/invoice_controller");
const {
  fetchSageX3CustomerInvoices,
  fetchSageX3SalesInvoiceMapped,
} = require("./sage x3/invoice_controller");
// Load Sage routes
// const sageRoutes = require("./routes/sageRoutes");
// const sageX3Routes = require("./routes/sageX3Routes");
const app = express();

// Enable CORS for your dev HTML page
app.use(
  cors({
    origin: ["*"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
    // allowedHeaders: ["Content-Type", "Authorization"], // Ensure necessary headers are allowed
  })
);

app.get("/", (req, res) => {
  res.json({ message: "app is working" });
});
app.get("/api/", (req, res) => {
  res.json({ message: "app is working" });
});

app.use(bodyParser.json());
app.use(cookieParser());

//sage x3
app.post("/testSageX3/invoices", fetchSageX3CustomerInvoices);
app.post("/testSageX3/mapped/:invoiceId", fetchSageX3SalesInvoiceMapped);

//sage 300
app.post("/testSage300/AR/invoiceBatches", fetchSage300BuyerInvoices);
app.post(
  "/testSage300/AR/firs_invoice/:batchId/:entryId",
  fetchSage300ARInvoiceWithCustomerFirsformatted
);

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
