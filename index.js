import express from "express"
import 'dotenv/config'
import cors from "cors"
import jwt from "jsonwebtoken"
import { MongoClient, ObjectId } from "mongodb"
import Stripe from "stripe"
const app = express()
// middleware
app.use(cors())
app.use(express.json())
const port = process.env.PORT || 5000
const clientBaseUrl = process.env.CLIENT_BASE_URL || "http://localhost:3000"
const jwtSecret = process.env.JWT_SECRET
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null
const client = new MongoClient(`mongodb+srv://${process.env.MONGODB_USERNAME_URL}:${process.env.MONGODB_PASSWORD_URL}@cluster0.4dwew1j.mongodb.net/`);

const database = client.db('SalonBook')
const addServices = database.collection("addServices")
const appointments = database.collection("appointments")

const verifyJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized: missing token" })
  }

  const token = authHeader.split(" ")[1]
  if (!jwtSecret) {
    return res.status(500).send({ message: "JWT is not configured on the server" })
  }

  try {
    const decoded = jwt.verify(token, jwtSecret)
    const email = String(decoded?.email || "").toLowerCase()
    const user = await database.collection("user").findOne({ email })

    if (user?.banned) {
      return res.status(403).send({ message: "Forbidden: your account is banned" })
    }

    req.decoded = {
      email,
      role: user?.role || (user ? "user" : "guest"),
    }
    req.authUser = user || null
    next()
  } catch (error) {
    return res.status(401).send({ message: "Unauthorized: invalid token" })
  }
}

const verifyAdmin = (req, res, next) => {
  if (req.decoded?.role !== "admin") {
    return res.status(403).send({ message: "Forbidden: admin access required" })
  }
  next()
}

app.post("/jwt", async (req, res) => {
  try {
    const { email } = req.body || {}
    if (!email) {
      return res.status(400).send({ message: "Email is required" })
    }
    if (!jwtSecret) {
      return res.status(500).send({ message: "JWT is not configured on the server" })
    }

    const normalizedEmail = String(email).toLowerCase()
    const user = await database.collection("user").findOne({ email: normalizedEmail })
    if (user?.banned) {
      return res.status(403).send({ message: "Forbidden: your account is banned" })
    }
    const role = user?.role || "user"

    const token = jwt.sign(
      { email: normalizedEmail, role },
      jwtSecret,
      { expiresIn: "7d" },
    )

    res.send({ token })
  } catch (error) {
    console.error("JWT issue error:", error)
    res.status(500).send({ message: "Failed to issue token", error: error.message })
  }
})


app.get('/', (req, res) => {
  res.send('SalonBook')

})
app.post('/Add-Services', verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const data = req.body
    const result = await addServices.insertOne(data)
    res.send(result)
  } catch (error) {
    console.error("Add service error:", error)
    res.status(500).send({ message: "Failed to add service", error: error.message })
  }
})
app.get("/addServices", verifyJWT, async (req, res) => {
  try {
    const { search, category, sort, status } = req.query

    const query = {}
    if (search) {
      query.serviceName = { $regex: String(search), $options: "i" }
    }
    if (category && category !== "All") {
      query.serviceCategory = String(category)
    }
    if (status && status !== "All") {
      query.serviceStatus = String(status)
    }

    let sortOption = {}
    if (sort === "price-low") sortOption = { price: 1 }
    if (sort === "price-high") sortOption = { price: -1 }

    const data = await addServices.find(query).sort(sortOption).toArray()
    res.send(data)
  } catch (error) {
    console.error("Get services error:", error)
    res.status(500).send({ message: "Failed to get services", error: error.message })
  }
})

app.get("/addServices/:id", verifyJWT, async (req, res) => {
  try {
    const { id } = req.params
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid service id" })
    }

    const service = await addServices.findOne({ _id: new ObjectId(id) })
    if (!service) {
      return res.status(404).send({ message: "Service not found" })
    }

    res.send(service)
  } catch (error) {
    console.error("Get service error:", error)
    res.status(500).send({ message: "Failed to get service", error: error.message })
  }
})

app.patch("/addServices/:id", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid service id" })
    }

    const { _id, ...updates } = req.body || {}
    const result = await addServices.updateOne(
      { _id: new ObjectId(id) },
      { $set: updates },
    )

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Service not found" })
    }

    res.send(result)
  } catch (error) {
    console.error("Update service error:", error)
    res.status(500).send({ message: "Failed to update service", error: error.message })
  }
})

app.delete("/addServices/:id", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid service id" })
    }

    const result = await addServices.deleteOne({ _id: new ObjectId(id) })
    if (result.deletedCount === 0) {
      return res.status(404).send({ message: "Service not found" })
    }

    res.send(result)
  } catch (error) {
    console.error("Delete service error:", error)
    res.status(500).send({ message: "Failed to delete service", error: error.message })
  }
})

app.post("/appointments", verifyJWT, async (req, res) => {
  try {
    const {
      serviceId,
      serviceName,
      serviceCategory,
      price,
      duration,
      appointmentDate,
      timeSlot,
      message,
      userName,
    } = req.body || {}
    const userEmail = String(req.decoded?.email || "").toLowerCase()

    if (!userEmail) {
      return res.status(401).send({ message: "Authentication required" })
    }
    if (!serviceId || !ObjectId.isValid(serviceId)) {
      return res.status(400).send({ message: "Valid service is required" })
    }
    if (!appointmentDate || !timeSlot) {
      return res.status(400).send({ message: "Appointment date and time slot are required" })
    }

    const service = await addServices.findOne({ _id: new ObjectId(serviceId) })
    if (!service) {
      return res.status(404).send({ message: "Service not found" })
    }
    if (service.serviceStatus !== "Active") {
      return res.status(400).send({ message: "Cannot book an inactive service" })
    }

    const duplicate = await appointments.findOne({
      serviceId: String(serviceId),
      appointmentDate: String(appointmentDate),
      timeSlot: String(timeSlot),
      appointmentStatus: { $in: ["Pending", "Confirmed"] },
    })
    if (duplicate) {
      return res.status(409).send({ message: "This time slot is already booked for the selected date" })
    }

    const appointment = {
      serviceId: String(serviceId),
      serviceName: String(serviceName || service.serviceName || ""),
      serviceCategory: String(serviceCategory || service.serviceCategory || ""),
      serviceImage: String(req.body?.serviceImage || service.serviceImage || ""),
      price: Number(price ?? service.price ?? 0),
      duration: Number(duration ?? service.duration ?? 0),
      appointmentDate: String(appointmentDate),
      timeSlot: String(timeSlot),
      message: String(message || "").trim(),
      userEmail: String(userEmail).toLowerCase(),
      userName: String(userName || "").trim(),
      appointmentStatus: "Pending",
      paymentStatus: "Unpaid",
      createdAt: new Date(),
    }

    const result = await appointments.insertOne(appointment)
    res.send(result)
  } catch (error) {
    console.error("Create appointment error:", error)
    res.status(500).send({ message: "Failed to book appointment", error: error.message })
  }
})

app.get("/appointments", verifyJWT, async (req, res) => {
  try {
    const isAdmin = req.decoded?.role === "admin"
    const tokenEmail = String(req.decoded?.email || "").toLowerCase()
    const { email } = req.query
    const query = {}

    if (isAdmin) {
      if (email) query.userEmail = String(email).toLowerCase()
    } else {
      query.userEmail = tokenEmail
    }

    const data = await appointments.find(query).sort({ createdAt: -1 }).toArray()
    res.send(data)
  } catch (error) {
    console.error("Get appointments error:", error)
    res.status(500).send({ message: "Failed to get appointments", error: error.message })
  }
})

app.get("/appointments/:id", verifyJWT, async (req, res) => {
  try {
    const { id } = req.params
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid appointment id" })
    }

    const appointment = await appointments.findOne({ _id: new ObjectId(id) })
    if (!appointment) {
      return res.status(404).send({ message: "Appointment not found" })
    }

    const isAdmin = req.decoded?.role === "admin"
    const tokenEmail = String(req.decoded?.email || "").toLowerCase()
    if (!isAdmin && String(appointment.userEmail).toLowerCase() !== tokenEmail) {
      return res.status(403).send({ message: "Forbidden" })
    }

    res.send(appointment)
  } catch (error) {
    console.error("Get appointment error:", error)
    res.status(500).send({ message: "Failed to get appointment", error: error.message })
  }
})

app.patch("/appointments/:id/cancel", verifyJWT, async (req, res) => {
  try {
    const { id } = req.params
    const tokenEmail = String(req.decoded?.email || "").toLowerCase()
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid appointment id" })
    }

    const appointment = await appointments.findOne({ _id: new ObjectId(id) })
    if (!appointment) {
      return res.status(404).send({ message: "Appointment not found" })
    }
    if (String(appointment.userEmail).toLowerCase() !== tokenEmail) {
      return res.status(403).send({ message: "You can only cancel your own appointment" })
    }
    if (appointment.appointmentStatus !== "Pending") {
      return res.status(400).send({ message: "Only pending appointments can be cancelled" })
    }

    const result = await appointments.updateOne(
      { _id: new ObjectId(id) },
      { $set: { appointmentStatus: "Cancelled" } },
    )
    res.send(result)
  } catch (error) {
    console.error("Cancel appointment error:", error)
    res.status(500).send({ message: "Failed to cancel appointment", error: error.message })
  }
})

app.patch("/appointments/:id/pay", verifyJWT, async (req, res) => {
  try {
    const { id } = req.params
    const tokenEmail = String(req.decoded?.email || "").toLowerCase()
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid appointment id" })
    }

    const appointment = await appointments.findOne({ _id: new ObjectId(id) })
    if (!appointment) {
      return res.status(404).send({ message: "Appointment not found" })
    }
    if (String(appointment.userEmail).toLowerCase() !== tokenEmail) {
      return res.status(403).send({ message: "You can only pay for your own appointment" })
    }
    if (appointment.appointmentStatus !== "Confirmed") {
      return res.status(400).send({ message: "Only confirmed appointments can be paid" })
    }
    if (appointment.paymentStatus === "Paid") {
      return res.status(400).send({ message: "Appointment is already paid" })
    }

    const result = await appointments.updateOne(
      { _id: new ObjectId(id) },
      { $set: { paymentStatus: "Paid" } },
    )
    res.send(result)
  } catch (error) {
    console.error("Pay appointment error:", error)
    res.status(500).send({ message: "Failed to pay for appointment", error: error.message })
  }
})

app.patch("/appointments/:id/confirm", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid appointment id" })
    }

    const appointment = await appointments.findOne({ _id: new ObjectId(id) })
    if (!appointment) {
      return res.status(404).send({ message: "Appointment not found" })
    }
    if (appointment.appointmentStatus !== "Pending") {
      return res.status(400).send({ message: "Only pending appointments can be confirmed" })
    }

    const result = await appointments.updateOne(
      { _id: new ObjectId(id) },
      { $set: { appointmentStatus: "Confirmed" } },
    )
    res.send(result)
  } catch (error) {
    console.error("Confirm appointment error:", error)
    res.status(500).send({ message: "Failed to confirm appointment", error: error.message })
  }
})

app.patch("/appointments/:id/admin-cancel", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid appointment id" })
    }

    const appointment = await appointments.findOne({ _id: new ObjectId(id) })
    if (!appointment) {
      return res.status(404).send({ message: "Appointment not found" })
    }
    if (appointment.paymentStatus === "Paid") {
      return res.status(400).send({ message: "Paid appointments cannot be cancelled" })
    }
    if (!["Pending", "Confirmed"].includes(appointment.appointmentStatus)) {
      return res.status(400).send({ message: "Only pending or confirmed appointments can be cancelled" })
    }

    const result = await appointments.updateOne(
      { _id: new ObjectId(id) },
      { $set: { appointmentStatus: "Cancelled" } },
    )
    res.send(result)
  } catch (error) {
    console.error("Admin cancel appointment error:", error)
    res.status(500).send({ message: "Failed to cancel appointment", error: error.message })
  }
})

app.patch("/appointments/:id/complete", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid appointment id" })
    }

    const appointment = await appointments.findOne({ _id: new ObjectId(id) })
    if (!appointment) {
      return res.status(404).send({ message: "Appointment not found" })
    }
    if (appointment.appointmentStatus !== "Confirmed") {
      return res.status(400).send({ message: "Only confirmed appointments can be completed" })
    }

    const result = await appointments.updateOne(
      { _id: new ObjectId(id) },
      { $set: { appointmentStatus: "Completed" } },
    )
    res.send(result)
  } catch (error) {
    console.error("Complete appointment error:", error)
    res.status(500).send({ message: "Failed to complete appointment", error: error.message })
  }
})

app.patch("/appointments/:id/mark-paid", verifyJWT, verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid appointment id" })
    }

    const appointment = await appointments.findOne({ _id: new ObjectId(id) })
    if (!appointment) {
      return res.status(404).send({ message: "Appointment not found" })
    }
    if (appointment.paymentStatus === "Paid") {
      return res.status(400).send({ message: "Appointment is already paid" })
    }

    const result = await appointments.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          paymentStatus: "Paid",
          paidAt: new Date().toISOString(),
          currency: appointment.currency || "USD",
        },
      },
    )
    res.send(result)
  } catch (error) {
    console.error("Mark paid error:", error)
    res.status(500).send({ message: "Failed to mark appointment as paid", error: error.message })
  }
})

app.post("/create-checkout-session", verifyJWT, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).send({ message: "Stripe is not configured on the server" })
    }

    const { appointmentId } = req.body || {}
    const tokenEmail = String(req.decoded?.email || "").toLowerCase()
    if (!ObjectId.isValid(appointmentId)) {
      return res.status(400).send({ message: "Invalid appointment id" })
    }

    const appointment = await appointments.findOne({ _id: new ObjectId(appointmentId) })
    if (!appointment) {
      return res.status(404).send({ message: "Appointment not found" })
    }
    if (String(appointment.userEmail).toLowerCase() !== tokenEmail) {
      return res.status(403).send({ message: "You can only pay for your own appointment" })
    }
    if (appointment.appointmentStatus !== "Confirmed") {
      return res.status(400).send({ message: "Only confirmed appointments can be paid" })
    }
    if (appointment.paymentStatus === "Paid") {
      return res.status(400).send({ message: "Appointment is already paid" })
    }

    const amount = Math.round(Number(appointment.price) * 100)
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).send({ message: "Invalid appointment amount" })
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: appointment.serviceName || "Salon Service",
              description: `Appointment on ${appointment.appointmentDate} at ${appointment.timeSlot}`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      customer_email: appointment.userEmail,
      metadata: {
        appointmentId: String(appointment._id),
        userEmail: String(appointment.userEmail),
      },
      success_url: `${clientBaseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}&appointmentId=${appointment._id}`,
      cancel_url: `${clientBaseUrl}/payment/cancel?appointmentId=${appointment._id}`,
    })

    res.send({ url: session.url })
  } catch (error) {
    console.error("Create checkout session error:", error)
    res.status(500).send({ message: "Failed to create payment session", error: error.message })
  }
})

app.post("/payments/verify", verifyJWT, async (req, res) => {
  try {
    if (!stripe) {
      return res.status(500).send({ message: "Stripe is not configured on the server" })
    }

    const { sessionId, appointmentId } = req.body || {}
    const tokenEmail = String(req.decoded?.email || "").toLowerCase()
    if (!sessionId || !ObjectId.isValid(appointmentId)) {
      return res.status(400).send({ message: "Invalid payment verification data" })
    }

    const appointment = await appointments.findOne({ _id: new ObjectId(appointmentId) })
    if (!appointment) {
      return res.status(404).send({ message: "Appointment not found" })
    }
    if (String(appointment.userEmail).toLowerCase() !== tokenEmail) {
      return res.status(403).send({ message: "Forbidden" })
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId)
    const paid = session.payment_status === "paid"
    const metadataMatches =
      session.metadata?.appointmentId === String(appointmentId) &&
      String(session.metadata?.userEmail || "").toLowerCase() === tokenEmail

    if (!paid || !metadataMatches) {
      return res.status(400).send({ message: "Payment not verified", paid, metadataMatches })
    }

    if (appointment.paymentStatus !== "Paid") {
      await appointments.updateOne(
        { _id: new ObjectId(appointmentId) },
        {
          $set: {
            paymentStatus: "Paid",
            stripeSessionId: String(sessionId),
            paidAt: new Date().toISOString(),
            currency: "USD",
          },
        },
      )
    }

    res.send({ success: true, paymentStatus: "Paid" })
  } catch (error) {
    console.error("Verify payment error:", error)
    res.status(500).send({ message: "Failed to verify payment", error: error.message })
  }
})

app.delete("/appointments/:id", verifyJWT, async (req, res) => {
  try {
    const { id } = req.params
    const tokenEmail = String(req.decoded?.email || "").toLowerCase()
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid appointment id" })
    }

    const appointment = await appointments.findOne({ _id: new ObjectId(id) })
    if (!appointment) {
      return res.status(404).send({ message: "Appointment not found" })
    }
    if (String(appointment.userEmail).toLowerCase() !== tokenEmail) {
      return res.status(403).send({ message: "You can only delete your own appointment" })
    }
    if (appointment.appointmentStatus !== "Cancelled") {
      return res.status(400).send({ message: "Only cancelled appointments can be deleted" })
    }

    const result = await appointments.deleteOne({ _id: new ObjectId(id) })
    res.send(result)
  } catch (error) {
    console.error("Delete appointment error:", error)
    res.status(500).send({ message: "Failed to delete appointment", error: error.message })
  }
})


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})