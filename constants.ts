
import { Personnel, ResetRequest, LogEntry, RequestStatus, UserRole } from './types';
import { mockData } from './mock-data';

// Menggunakan data dari mock-data.ts yang sudah bertipe data aman
export const INITIAL_PERSONNEL: Personnel[] = mockData.personnel as Personnel[];

export const INITIAL_REQUESTS: ResetRequest[] = mockData.requests as ResetRequest[];

export const INITIAL_LOGS: LogEntry[] = mockData.logs as LogEntry[];

export const SYSTEM_ACTIVITIES = mockData.systemActivities;
