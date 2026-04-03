console.log(JSON.stringify({
    "version": "2.0",
    "routeKey": "POST /survey",
    "rawPath": "/survey",
    "requestContext": {
        "http": {
            "method": "POST",
            "path": "/survey"
        }
    },
    "headers": {
        "Content-Type": "application/json"
    },
    "body": JSON.stringify({
        "data": {
            "test": { "status": true, "type": "smoke test" },
            "timestamp": "2026-04-03T13:00:55.026Z",
            "surveyTitle": "Protecting Under the Hard Hat",
            "surveyVersion": "3.0.0",
            "mode": "self",
            "site": null,
            "query": {},
            "gps": {
                "supported": true,
                "status": "denied",
                "capturedAt": "2026-04-03T13:00:30.448Z",
                "error": {
                    "code": 1,
                    "message": "User denied Geolocation"
                }
            },
            "answers": {
                "k10_1": "1",
                "k10_2": "1",
                "k10_3": "1",
                "k10_4": "1",
                "k10_5": "1",
                "k10_6": "1",
                "k10_7": "1",
                "k10_8": "1",
                "k10_9": "1",
                "k10_10": "1",
                "t1": [
                    "pnots"
                ],
                "t2": [
                    "nervous"
                ],
                "t3": [
                    "none"
                ],
                "t4": [
                    "own_coping"
                ],
                "t5": [
                    "none"
                ],
                "t6": [
                    "own_coping"
                ],
                "notes1": [
                    "family"
                ],
                "t7": "no",
                "t10": "none",
                "g0": "no"
            },
            "sessionId": "50b1fbbd-2475-4c2f-a600-b093c928ce5d",
            "language": "en-US",
            "completed": true
        }
    }),
    "isBase64Encoded": false
}));