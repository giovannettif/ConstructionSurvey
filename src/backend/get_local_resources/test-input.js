console.log(
    JSON.stringify({
        version: "2.0",
        routeKey: "GET /local-resources",
        rawPath: "/local-resources",
        requestContext: {
            http: {
                method: "GET",
                path: "/local-resources",
            },
        },
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            is_test: true,
            session_id: crypto.randomUUID(),
            device_id: crypto.randomUUID(),
            zip_code: "07102",
            max_radius: 25 * 1609,
        }),
        isBase64Encoded: false,
    }),
);
