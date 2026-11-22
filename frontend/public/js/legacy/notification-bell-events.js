window.rsHandlers['notification-bell-0'] = function(event) { toggleNotifPanel() };
window.rsHandlers['notification-bell-1'] = function(event) { markAllRead() };
window.rsHandlers['notification-bell-2'] = function(event) { loadAllNotifications() };
window.rsHandlers['notification-bell-3'] = function(event) { return false; };
window.rsHandlers['notification-bell-4'] = function(event) { markRead(this.getAttribute('data-rs-arg-0'), this) };
window.rsHandlers['notification-bell-5'] = function(event) { this.parentElement.remove() };
