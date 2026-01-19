// /functions/api/submit.js
export async function onRequestPost({ request, env }) {
	try {
		let input = await request.formData();

		// Get form data
		let tmp, output = {};
		for (let [key, value] of input) {
			tmp = output[key];
			output[key] = tmp === undefined ? value : [].concat(tmp, value);
		}

		// Store in KV
		if (env && env.FORM_SUBMISSIONS) {
			const timestamp = new Date().toISOString();
			const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
			const userAgent = request.headers.get('User-Agent') || 'unknown';
			
			const submissionData = {
				...output,
				_metadata: {
					timestamp,
					ip,
					userAgent,
					storedAt: new Date().toISOString()
				}
			};
			
			const submissionId = Date.now();
			const kvKey = `submission_${submissionId}`;
			
			await env.FORM_SUBMISSIONS.put(
				kvKey,
				JSON.stringify(submissionData),
				{ expirationTtl: 60 * 60 * 24 * 90 }
			);
			
			console.log(`✅ Stored in FORM_SUBMISSIONS KV: ${kvKey}`);
		}

		// Redirect to thank you page
		return Response.redirect('https://forms-api.pages.dev/thank-you', 303);
		
	} catch (err) {
		console.error('Form error:', err);
		return Response.redirect('https://forms-api.pages.dev/?error=1', 303);
	}
}
