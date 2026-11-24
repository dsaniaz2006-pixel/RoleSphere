"use strict";

// FIXED: Mock the entire emailService module BEFORE any other imports
jest.mock("../backend/services/emailService", () => {
  const originalModule = jest.requireActual("../backend/services/emailService");
  return {
    ...originalModule,
    sendAccountRemovedEmail: jest.fn(),
  };
});

const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const bcrypt = require("bcryptjs");
const Employee = require("../backend/models/Employee");
const HR = require("../backend/models/HR");
const Admin = require("../backend/models/Admin");
const emailService = require("../backend/services/emailService");

let mongod;
let app;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri();
  process.env.SESSION_SECRET = "test-secret";
  
  await mongoose.connect(process.env.MONGO_URI);
  
  const { createApp } = require("../app");
  app = createApp();
});

afterAll(async () => {
  const sessionStore = app.get('sessionStore');
  if (sessionStore && typeof sessionStore.close === 'function') {
    await sessionStore.close();
  }
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Employee.deleteMany({});
  await HR.deleteMany({});
  await Admin.deleteMany({});
  // Reset the mock before each test
  emailService.sendAccountRemovedEmail.mockReset();
});

describe("Open Employee Registration Workflow", () => {
  test("Employee registers, is auto-approved, and redirected to dashboard", async () => {
    const res = await request(app)
      .post("/employee/register")
      .send({ name: "Open Employee", email: "open@test.com", password: "password123" });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/employee/dashboard");

    const emp = await Employee.findOne({ email: "open@test.com" });
    expect(emp).toBeTruthy();
    expect(emp.isApproved).toBe(true);
    expect(emp.status).toBe("approved");
  });

  test("Employee cannot register as Admin by modifying request body", async () => {
    const res = await request(app)
      .post("/employee/register")
      .send({ name: "Hacker", email: "hacker@test.com", password: "password123", role: "Admin" });

    const emp = await Employee.findOne({ email: "hacker@test.com" });
    expect(emp?.role).not.toBe("Admin");
  });

  test("Employee can log in immediately after registration", async () => {
    await request(app)
      .post("/employee/register")
      .send({ name: "Open Employee", email: "open@test.com", password: "password123" });

    const loginRes = await request(app)
      .post("/login")
      .send({ email: "open@test.com", password: "password123", role: "Employee" });

    expect(loginRes.status).toBe(302);
    expect(loginRes.headers.location).toBe("/employee/dashboard");
  });
});

describe("HR and Manager Pending Workflow (Must Remain Unchanged)", () => {
  test("HR registers and remains pending", async () => {
    const res = await request(app)
      .post("/hr/register")
      .send({ name: "Pending HR", email: "hr@test.com", password: "password123" });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/register-pending");

    const hr = await HR.findOne({ email: "hr@test.com" });
    expect(hr.isApproved).toBe(false);
    expect(hr.status).toBe("pending");
  });

  test("HR cannot log in before Admin approval", async () => {
    await HR.create({
      name: "Pending HR", email: "hr@test.com", password: await bcrypt.hash("password123", 10), isApproved: false, status: "pending"
    });

    const res = await request(app)
      .post("/login")
      .send({ email: "hr@test.com", password: "password123", role: "HR" });

    expect(res.status).toBe(403);
  });
});

describe("Admin Employee Removal", () => {
  test("Admin deletion sends account-removed email and deletes record", async () => {
    // Set up the mock return value
    emailService.sendAccountRemovedEmail.mockResolvedValue({ 
      accepted: ["emp@test.com"] 
    });

    const adminPassword = "adminpassword123";
    await Admin.create({ 
        name: "Test Admin", 
        email: "admin@test.com", 
        password: await bcrypt.hash(adminPassword, 10),
        role: "Admin" 
    });

    const emp = await Employee.create({
      name: "To Be Deleted", email: "emp@test.com", password: "hashed", isApproved: true, status: "approved"
    });

    const agent = request.agent(app);
    await agent
      .post("/api/admin/login")
      .send({ email: "admin@test.com", password: adminPassword });

    const res = await agent
      .post(`/api/admin/delete-employee/${emp._id}`)
      .send(); 

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/admin/dashboard");
    
    const deletedEmp = await Employee.findById(emp._id);
    expect(deletedEmp).toBeNull();
    
    // Verify the mocked function was called with the right arguments
    expect(emailService.sendAccountRemovedEmail).toHaveBeenCalledWith("emp@test.com", "To Be Deleted");
  });
});
