// English message bundle for the `messaging` namespace. Components resolve these
// through `useMessagingT()` (below); the addon manifest contributes the bundle
// under `i18n.messaging`. Keys are dotted by surface. Metadata-driven field/column
// labels live in the SDL, not here — only bespoke component copy is routed.

import { useNamespaceT } from "@angee/ui";

export const enMessagingMessages: Record<string, string> = {
  // RecordChatterPane — the Comments chatter tab.
  "messaging.chatter.noRecord": "No record selected",
  "messaging.chatter.noRecordHint": "Open a record to discuss it.",
  "messaging.chatter.loading": "Loading comments",
  "messaging.chatter.disabled": "Comments are not enabled",
  "messaging.chatter.disabledHint": "This record has no model chatter thread.",
  "messaging.chatter.following": "{count} following",
  "messaging.chatter.unread": "{count} unread",
  "messaging.chatter.failed": "{count} failed",
  "messaging.chatter.markRead": "Mark read",
  "messaging.chatter.follow": "Follow",
  "messaging.chatter.unfollow": "Unfollow",
  "messaging.chatter.search": "Search comments",
  "messaging.chatter.feedLabel": "Comments",
  "messaging.chatter.results": "{count} results",
  "messaging.chatter.emptyTitle": "No comments yet",
  "messaging.chatter.emptyHint": "Start the discussion from this record.",
  "messaging.chatter.noMatchTitle": "No matching comments",
  "messaging.chatter.noMatchHint": "Try a different search.",
  "messaging.chatter.editedMeta": "edited",

  // Message row affordances.
  "messaging.message.author": "Someone",
  "messaging.message.reactions": "Reactions",
  "messaging.message.markDone": "Mark message done",
  "messaging.message.reply": "Reply to message",
  "messaging.message.star": "Star message",
  "messaging.message.unstar": "Unstar message",
  "messaging.message.addReaction": "Add reaction",
  "messaging.message.edit": "Edit comment",
  "messaging.message.delete": "Delete message",
  "messaging.message.editLabel": "Edit comment",
  "messaging.message.cancel": "Cancel",
  "messaging.message.save": "Save",
  "messaging.message.replyingTo": "Replying to {kind}",
  "messaging.message.kindNote": "internal note",
  "messaging.message.kindUpdate": "update",
  "messaging.message.kindMessage": "message",
  "messaging.message.directionInbound": "Inbound",
  "messaging.message.directionOutbound": "Outbound",

  // Composer.
  "messaging.composer.comment": "Comment",
  "messaging.composer.note": "Note",
  "messaging.composer.cancelReply": "Cancel reply",
  "messaging.composer.recipients": "Recipients",
  "messaging.composer.addRecipient": "Add recipient",
  "messaging.composer.loadingRecipients": "Loading recipients",
  "messaging.composer.noRecipients": "No recipients",
  "messaging.composer.followRecipients": "Follow",
  "messaging.composer.suggested": "Suggested",
  "messaging.composer.follower": "Follower",
  "messaging.composer.removeRecipient": "Remove {name}",
  "messaging.composer.writeComment": "Write a comment",
  "messaging.composer.logNote": "Log an internal note",
  "messaging.composer.messageLabel": "Message",
  "messaging.composer.attach": "Attach files",
  "messaging.composer.send": "Send",
  "messaging.composer.log": "Log",
  "messaging.composer.dropFiles": "Drop files to attach",
  "messaging.composer.removeAttachment": "Remove {name}",
  "messaging.composer.clearUploads": "Clear finished uploads",

  // Upload task states.
  "messaging.upload.preparing": "Preparing",
  "messaging.upload.uploading": "Uploading",
  "messaging.upload.finalizing": "Finalizing",
  "messaging.upload.failed": "Failed",
  "messaging.upload.attached": "Attached",

  // Follow subtypes.
  "messaging.subtype.legend": "Notification types",

  // Chatter transport / mutation errors.
  "messaging.error.generic": "Something went wrong. Try again.",
  "messaging.error.postComment": "Could not post comment.",
  "messaging.error.postNote": "Could not post note.",
  "messaging.error.update": "Could not update comment.",
  "messaging.error.delete": "Could not delete message.",
  "messaging.error.reaction": "Could not update reaction.",
  "messaging.error.starred": "Could not update starred message.",
  "messaging.error.following": "Could not update followers.",
  "messaging.error.filters": "Could not update notification filters.",
  "messaging.error.markRead": "Could not mark comments read.",
  "messaging.error.markDone": "Could not mark message done.",

  // ThreadTranscript — the channel conversation transcript on the Thread detail.
  "messaging.transcript.tab": "Conversation",
  "messaging.transcript.label": "Conversation transcript",
  "messaging.transcript.loading": "Loading conversation",
  "messaging.transcript.error": "Could not load the conversation.",
  "messaging.transcript.emptyTitle": "No messages yet",
  "messaging.transcript.emptyHint": "This thread has no messages.",
  "messaging.transcript.loadOlder": "Load older messages",
  "messaging.transcript.noteLabel": "Internal note",

  // RecordActivityPane — the Activity chatter tab.
  "messaging.activity.noRecord": "No record selected",
  "messaging.activity.noRecordHint": "Open a record to plan activities.",
  "messaging.activity.loading": "Loading activities",
  "messaging.activity.disabled": "Activities are not enabled",
  "messaging.activity.disabledHint": "This record has no model chatter thread.",
  "messaging.activity.emptyTitle": "No activities yet",
  "messaging.activity.emptyHint": "Plan the next step for this record.",
  "messaging.activity.summary": "Activity summary",
  "messaging.activity.notes": "Notes",
  "messaging.activity.dueDate": "Due date",
  "messaging.activity.noDueDate": "No due date",
  "messaging.activity.clearDueDate": "Clear due date",
  "messaging.activity.schedule": "Schedule",
  "messaging.activity.feedback": "Completion feedback",
  "messaging.activity.markDone": "Mark done",
  "messaging.activity.cancel": "Cancel activity",
  "messaging.activity.stateDone": "Done",
  "messaging.activity.stateCanceled": "Canceled",
  "messaging.activity.stateOverdue": "Overdue",
  "messaging.activity.stateToday": "Today",
  "messaging.activity.statePlanned": "Planned",
  "messaging.activity.errorSchedule": "Could not schedule activity.",
  "messaging.activity.errorComplete": "Could not complete activity.",
  "messaging.activity.errorCancel": "Could not cancel activity.",
};

// A translator bound to the `messaging` namespace: resolves against the host
// runtime's merged i18n first, then falls back to the bundled English. Thin alias
// over the shared `useNamespaceT` owner, so the copy still renders provider-less.
export function useMessagingT() {
  return useNamespaceT("messaging", enMessagingMessages);
}
