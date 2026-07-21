// Given a user ZIP code and max radius (meters), returns resources located within that radius.
// See spec.md for the full request/response contract.

import express from "express";
import serverless from "serverless-http";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import Papa from "papaparse";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// S3 Configuration
const S3_BUCKET = process.env.S3_BUCKET_NAME;
const s3 = new S3Client({ region: process.env.AWS_REGION });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EARTH_RADIUS_METERS = 6371000;

// ---------------------------------------------------------------------------
// Module Scope: load datasets once per Lambda container (cold start).
// ---------------------------------------------------------------------------

/**
 * Zero-pads a ZIP code to guarantee a length of 5, e.g. "680" -> "00680".
 * @param {string|number} zip
 * @returns {string} Zero-padded ZIP code.
 */
function normalizeZip(zip) {
    return String(zip).padStart(5, "0");
}

/**
 * Loads and parses the local ZIP codes dataset (zip-code-data.csv) into:
 * { [normalizedZip]: { lat, long, city, state } }
 * @returns {Object}
 */
function loadZipData() {
    const csvText = fs.readFileSync(
        path.join(__dirname, "zip-code-data.csv"),
        "utf-8",
    );
    const { data: rows } = Papa.parse(csvText, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
    });

    const zipData = {};
    for (const row of rows) {
        const zip = normalizeZip(row.Zip);
        zipData[zip] = {
            lat: row.Latitude,
            long: row.Longitude,
            city: row.City,
            state: row.State,
        };
    }
    return zipData;
}

const zipData = loadZipData();

/**
 * Finds the resources dataset's ZIP code column (schema is flexible/manually
 * maintained), matching the first header containing "zip" case-insensitively.
 * @param {string[]} fields - CSV header names.
 * @returns {string}
 */
function findZipColumn(fields) {
    const zipColumn = fields.find((field) =>
        field.toLowerCase().includes("zip"),
    );
    if (!zipColumn)
        throw new Error("Resources dataset is missing a ZIP code column.");
    return zipColumn;
}

/**
 * Fetches resources.csv from S3 and parses it into:
 * { [normalizedZip]: [resource, ...] }
 * @returns {Promise<Object>}
 */
async function loadResourcesData() {
    const response = await s3.send(
        new GetObjectCommand({ Bucket: S3_BUCKET, Key: "resources.csv" }),
    );
    const csvText = await response.Body.transformToString();
    const { data: rows, meta } = Papa.parse(csvText, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
    });
    const zipColumn = findZipColumn(meta.fields);
    const resourcesData = {};

    for (const row of rows) {
        const zip = normalizeZip(row[zipColumn]);
        (resourcesData[zip] = resourcesData[zip] ?? []).push(row);
    }
    return resourcesData;
}

// [TODO] add TTL, clear cache upon error, and error handling
// Cached across warm invocations; only fetched once per container lifetime.
let resourcesDataPromise = null;
function getResourcesData() {
    if (!resourcesDataPromise) resourcesDataPromise = loadResourcesData();
    return resourcesDataPromise;
}

// ---------------------------------------------------------------------------
// Function Scope: validation
// ---------------------------------------------------------------------------

/**
 * Validates the request body against the spec's requirements.
 * @param {{ zip_code: any, max_radius: any }} body
 * @returns {string|null} Descriptive error message, or null if valid.
 */
function validateRequest({ zip_code: zipCode, max_radius: maxRadius }) {
    if (maxRadius == null) {
        return "max_radius is required.";
    }
    if (
        typeof maxRadius !== "number" ||
        Number.isNaN(maxRadius) ||
        !(maxRadius === -1 || maxRadius >= 0)
    ) {
        return "max_radius must be a non-negative number, or -1 to retrieve all resources.";
    }

    if (maxRadius === -1) {
        // max_radius == -1 is the sole indicator of "no ZIP code" requests.
        if (zipCode != null) {
            return "zip_code must not be provided when max_radius is -1.";
        }
    } else {
        if (zipCode == null) {
            return "zip_code is required when max_radius is not -1.";
        }
        if (typeof zipCode !== "string") {
            return "zip_code must be a string.";
        }
        if (zipCode.length !== 5) {
            return "zip_code must be exactly 5 characters long.";
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// Function Scope: distance calculation
// ---------------------------------------------------------------------------

function toRadians(degrees) {
    return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance between two lat/long pairs, in meters (Haversine formula).
 * @param {number} lat1
 * @param {number} long1
 * @param {number} lat2
 * @param {number} long2
 * @returns {number} Distance in meters.
 */
function haversineDistance(lat1, long1, lat2, long2) {
    const dLat = toRadians(lat2 - lat1);
    const dLong = toRadians(long2 - long1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(lat1)) *
            Math.cos(toRadians(lat2)) *
            Math.sin(dLong / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_METERS * c;
}

// ---------------------------------------------------------------------------
// Express.js Setup
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

/**
 * GET /local-resources
 *
 * Returns resources within `max_radius` meters of `zip_code`, or all resources
 * when `max_radius` is -1 (in which case `zip_code` must be omitted).
 *
 * Request body:
 *   { zip_code?: string, max_radius: number }
 *
 * Responses:
 *   200 - { success: true, type, message, zip_code_info?, resources: [...] }
 *   400 - { success: false, error } - missing/invalid fields
 *   404 - { success: false, error } - zip_code not found in ZIP dataset
 *   500 - { success: false, error: "Internal server error." } - unhandled error
 */
app.get("/local-resources", async (req, res) => {
    const { zip_code: zipCode, max_radius: maxRadius } = req.body ?? {};
    console.log(`Request: zip_code=${zipCode}, max_radius=${maxRadius}`);

    try {
        const validationError = validateRequest({
            zip_code: zipCode,
            max_radius: maxRadius,
        });
        if (validationError) {
            console.warn(`400: ${validationError}`);
            return res
                .status(400)
                .json({ success: false, error: validationError });
        }

        const resourcesData = await getResourcesData();

        // max_radius == -1: return every resource, unsorted, with no distance/ZIP info.
        if (maxRadius === -1) {
            const resources = Object.values(resourcesData).flat();
            console.log(`200: all_resources, ${resources.length} resource(s)`);
            return res.status(200).json({
                success: true,
                type: "all_resources",
                message: `Found ${resources.length} resource(s).`,
                resources,
            });
        }

        const userZip = normalizeZip(zipCode);
        const userZipInfo = zipData[userZip];
        if (!userZipInfo) {
            const error = `ZIP code ${zipCode} not found.`;
            console.warn(`404: ${error}`);
            return res.status(404).json({ success: false, error });
        }

        // [TODO] optimization: distances to only resource ZIPs, filter out resources
        // Distance from the user ZIP to every known ZIP, filtered to max_radius, closest first.
        const distances = [];
        for (const [zip, info] of Object.entries(zipData)) {
            const distance = haversineDistance(
                userZipInfo.lat,
                userZipInfo.long,
                info.lat,
                info.long,
            );
            if (distance <= maxRadius) distances.push([zip, distance]);
        }

        distances.sort((a, b) => a[1] - b[1]);

        const localResources = [];
        for (const [zip, distance] of distances) {
            const resourcesAtZip = resourcesData[zip] ?? [];
            for (const resource of resourcesAtZip) {
                localResources.push({ ...resource, distance });
            }
        }

        console.log(
            `200: local_resources, ${localResources.length} resource(s)`,
        );
        return res.status(200).json({
            success: true,
            type: "local_resources",
            message: `Found ${localResources.length} resource(s) within ${maxRadius} meters of ZIP code ${zipCode}.`,
            zip_code_info: {
                zip_code: zipCode,
                city: userZipInfo.city,
                state: userZipInfo.state,
            },
            resources: localResources,
        });
    } catch (e) {
        console.error("500: Internal server error:", e);
        return res
            .status(500)
            .json({ success: false, error: "Internal server error." });
    }
});

export const handler = serverless(app);
