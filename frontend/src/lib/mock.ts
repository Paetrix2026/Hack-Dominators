export type HerbRequest = {
  id: string;
  herb: string;
  quantity: string;
  fromManufacturer: string;
  toFarmer: string;
  status: "Pending" | "Accepted" | "Rejected";
  requestDate: string;
};

export type Batch = {
  id: string;
  herb: string;
  date: string;
  trust: number;
  quality: number;
  geo: string;
  status: "Collected" | "Processed" | "Manufactured" | "Packaged";
  hash: string;
  fraud?: boolean;
  decision?: "Approved" | "Rejected";
  farmer: string;
};

export const herbRequests: HerbRequest[] = [
  { id: "REQ-001", herb: "Ashwagandha", quantity: "50 kg", fromManufacturer: "Anita Shah", toFarmer: "Ravi Kumar", status: "Pending", requestDate: "2025-04-20" },
  { id: "REQ-002", herb: "Tulsi", quantity: "30 kg", fromManufacturer: "Anita Shah", toFarmer: "Lakshmi N.", status: "Accepted", requestDate: "2025-04-19" },
];

export const batches: Batch[] = [
  { id: "ATC-2391", herb: "Ashwagandha",   date: "2025-04-19", trust: 94, quality: 92, geo: "Kerala, IN",     status: "Packaged",     hash: "0x9f3b…a72e", farmer: "Ravi Kumar" },
  { id: "ATC-2390", herb: "Tulsi",         date: "2025-04-18", trust: 88, quality: 86, geo: "Karnataka, IN",  status: "Manufactured", hash: "0x8a1d…43cb", farmer: "Lakshmi N." },
  { id: "ATC-2389", herb: "Brahmi",        date: "2025-04-18", trust: 76, quality: 78, geo: "Tamil Nadu, IN", status: "Processed",    hash: "0x7c22…ff90", farmer: "Mohan Rao" },
  { id: "ATC-2388", herb: "Neem",          date: "2025-04-17", trust: 42, quality: 48, geo: "Andhra, IN",     status: "Collected",    hash: "0x6e10…1d2a", fraud: true, farmer: "Suresh P." },
  { id: "ATC-2387", herb: "Shatavari",     date: "2025-04-17", trust: 91, quality: 90, geo: "Maharashtra, IN",status: "Manufactured", hash: "0x5b88…77e3", farmer: "Anita Devi" },
  { id: "ATC-2386", herb: "Turmeric",      date: "2025-04-16", trust: 83, quality: 81, geo: "Kerala, IN",     status: "Packaged",     hash: "0x4d7e…92ac", farmer: "Ravi Kumar" },
  { id: "ATC-2385", herb: "Amla",          date: "2025-04-15", trust: 35, quality: 40, geo: "Unknown",        status: "Collected",    hash: "0x3a90…5fbb", fraud: true, farmer: "Unverified" },
];
