import { Types } from "mongoose";
import connectMongo from "@/libs/mongoose";
import AuditEventModel, {
  type AuditActorType,
  type AuditStatus,
} from "@/models/AuditEvent";

const MAX_METADATA_DEPTH = 3;
const MAX_METADATA_KEYS = 40;
const MAX_STRING_LENGTH = 500;

type AuditMetadataValue =
  | string
  | number
  | boolean
  | null
  | AuditMetadataValue[]
  | { [key: string]: AuditMetadataValue };

export interface AuditEventInput {
  userId?: string | Types.ObjectId | null;
  actorType: AuditActorType;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  status: AuditStatus;
  metadata?: Record<string, unknown>;
}

const sanitizeString = (value: string): string => {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_LENGTH - 3)}...`;
};

const sanitizeMetadataValue = (
  value: unknown,
  depth: number
): AuditMetadataValue => {
  if (value === null) {
    return null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    if (depth >= MAX_METADATA_DEPTH) {
      return [];
    }

    return value
      .slice(0, MAX_METADATA_KEYS)
      .map((entry) => sanitizeMetadataValue(entry, depth + 1));
  }

  if (typeof value === "object" && value) {
    if (depth >= MAX_METADATA_DEPTH) {
      return {};
    }

    const entries = Object.entries(value as Record<string, unknown>).slice(
      0,
      MAX_METADATA_KEYS
    );
    const sanitizedObject: Record<string, AuditMetadataValue> = {};

    for (const [key, entryValue] of entries) {
      sanitizedObject[key] = sanitizeMetadataValue(entryValue, depth + 1);
    }

    return sanitizedObject;
  }

  return String(value);
};

const sanitizeMetadata = (
  metadata: Record<string, unknown> | undefined
): Record<string, AuditMetadataValue> => {
  if (!metadata) {
    return {};
  }

  const entries = Object.entries(metadata).slice(0, MAX_METADATA_KEYS);
  const sanitized: Record<string, AuditMetadataValue> = {};

  for (const [key, value] of entries) {
    sanitized[key] = sanitizeMetadataValue(value, 0);
  }

  return sanitized;
};

const toObjectId = (value: string | Types.ObjectId | null | undefined): Types.ObjectId | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Types.ObjectId) {
    return value;
  }

  if (!Types.ObjectId.isValid(value)) {
    return null;
  }

  return new Types.ObjectId(value);
};

export const logAuditEvent = async (input: AuditEventInput): Promise<void> => {
  try {
    await connectMongo();

    const userId = toObjectId(input.userId);
    const metadata = sanitizeMetadata(input.metadata);

    await AuditEventModel.create({
      userId: userId ?? undefined,
      actorType: input.actorType,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? undefined,
      status: input.status,
      metadata,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown audit event logging error";
    console.error("Failed to persist audit event:", message);
  }
};
