(function() {
	'use strict';

	window.addEventListener('load', () => {
		const yearEl = document.getElementById('year');
		if (yearEl) yearEl.textContent = String(new Date().getFullYear());

		// Email/password login is now handled via Firebase in login.html module script.

	});
})();


