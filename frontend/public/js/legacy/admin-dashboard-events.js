window.rsHandlers['admin-dashboard-0'] = function(event) { toggleAnnouncementPanel() };
window.rsHandlers['admin-dashboard-1'] = function(event) { markAllAnnouncementsSeen() };
window.rsHandlers['admin-dashboard-2'] = function(event) { updateLeaveStatus(this.getAttribute('data-rs-arg-0'), 'Approved') };
window.rsHandlers['admin-dashboard-3'] = function(event) { updateLeaveStatus(this.getAttribute('data-rs-arg-0'), 'Rejected') };
window.rsHandlers['admin-dashboard-4'] = function(event) { event.stopPropagation() };
window.rsHandlers['admin-dashboard-5'] = function(event) { openAnnModal(this) };
window.rsHandlers['admin-dashboard-6'] = function(event) { closeAnnModal() };
