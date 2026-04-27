import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { messaging } from "../lib/firebase.js";
export const onBovStatusChange = onDocumentUpdated("bovs/{bovId}", async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) {
        return;
    }
    const oldStatus = String(before.status ?? "");
    const newStatus = String(after.status ?? "");
    if (!newStatus || oldStatus === newStatus) {
        return;
    }
    const token = String(after.driverFcmToken ?? "");
    if (!token) {
        logger.info("BOV status changed but no driver token", { bovId: event.params.bovId, newStatus });
        return;
    }
    await messaging.send({
        token,
        notification: {
            title: "BOV status updated",
            body: `Your BOV is now marked as ${newStatus}`,
        },
        data: {
            bovId: String(event.params.bovId),
            status: newStatus,
        },
    });
});
