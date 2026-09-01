/* Vercel Speed Insights initialization
 * Injects the Speed Insights tracking script for performance monitoring.
 * See: https://vercel.com/docs/speed-insights/quickstart
 */
(function() {
  'use strict';
  
  // Initialize the Speed Insights queue
  if (typeof window !== 'undefined' && !window.si) {
    window.si = function() {
      (window.siq = window.siq || []).push(arguments);
    };
  }
  
  // Load the Speed Insights script
  if (typeof document !== 'undefined') {
    var script = document.createElement('script');
    script.defer = true;
    
    // Use the appropriate script URL based on environment
    // In production on Vercel, the script will be automatically served at the correct path
    // In development/local, use the debug version
    var isDevelopment = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1';
    
    script.src = isDevelopment 
      ? 'https://va.vercel-scripts.com/v1/speed-insights/script.debug.js'
      : '/_vercel/speed-insights/script.js';
    
    // Append to head
    var firstScript = document.getElementsByTagName('script')[0];
    if (firstScript && firstScript.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else {
      document.head.appendChild(script);
    }
  }
})();
