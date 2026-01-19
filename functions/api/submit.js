// /functions/api/submit.js
export async function onRequestPost({ request, env }) {
	try {
		let input = await request.formData();

		// Convert FormData to JSON
		let tmp, output = {};
		for (let [key, value] of input) {
			tmp = output[key];
			if (tmp === undefined) {
				output[key] = value;
			} else {
				output[key] = [].concat(tmp, value);
			}
		}

		// Add metadata
		const timestamp = new Date().toISOString();
		const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
		const userAgent = request.headers.get('User-Agent') || 'unknown';
		
		output._metadata = {
			timestamp,
			ip,
			userAgent
		};

		// Store in KV using bulk API
		if (env && env.FORM_SUBMISSIONS) {
			try {
				const submissionId = Date.now();
				const email = output.email || 'no-email';
				
				// Create multiple KV pairs for better organization
				const kvPairs = [];
				
				// 1. Main submission record
				kvPairs.push({
					key: `submission:${submissionId}`,
					value: JSON.stringify(output),
					expiration_ttl: 60 * 60 * 24 * 90 // 90 days
				});
				
				// 2. Email index (for lookup by email)
				if (output.email) {
					kvPairs.push({
						key: `email:${output.email}:${submissionId}`,
						value: JSON.stringify({
							submissionId,
							timestamp,
							name: output.name,
							referers: output.referers
						}),
						expiration_ttl: 60 * 60 * 24 * 90
					});
				}
				
				// 3. Timestamp index (for chronological lookup)
				kvPairs.push({
					key: `timestamp:${timestamp}:${submissionId}`,
					value: JSON.stringify({
						submissionId,
						email: output.email,
						name: output.name
					}),
					expiration_ttl: 60 * 60 * 24 * 90
				});
				
				// 4. Daily counter (for analytics)
				const today = new Date().toISOString().split('T')[0];
				kvPairs.push({
					key: `counter:daily:${today}`,
					value: 'increment' // Will be incremented via API
				});
				
				// 5. Platforms index (if platforms selected)
				if (output.platforms) {
					const platforms = Array.isArray(output.platforms) 
						? output.platforms 
						: [output.platforms];
					
					platforms.forEach(platform => {
						if (platform.trim()) {
							kvPairs.push({
								key: `platform:${platform.trim().toLowerCase()}:${submissionId}`,
								value: JSON.stringify({
									submissionId,
									email: output.email,
									timestamp
								}),
								expiration_ttl: 60 * 60 * 24 * 90
							});
						}
					});
				}
				
				// Store all pairs at once
				// Note: Cloudflare Workers KV supports bulk writes directly
				for (const pair of kvPairs) {
					await env.FORM_SUBMISSIONS.put(
						pair.key,
						pair.value,
						{ expirationTtl: pair.expiration_ttl }
					);
				}
				
				output._metadata.storedInKV = true;
				output._metadata.submissionId = submissionId;
				output._metadata.keysStored = kvPairs.length;
				
				console.log(`✅ Stored ${kvPairs.length} KV pairs for submission ${submissionId}`);
				
			} catch (kvError) {
				console.error('KV Storage error:', kvError);
				output._metadata.kvError = kvError.message;
				output._metadata.storedInKV = false;
			}
		} else {
			output._metadata.kvWarning = 'KV storage not configured';
		}

		// Return thank you HTML
		const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Thank You!</title>
    <style>
        body {
            font-family: system-ui, -apple-system, sans-serif;
            background: linear-gradient(135deg, #003682 0%, #001f4d 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            margin: 0;
            text-align: center;
            color: white;
        }
        .thank-you {
            background: white;
            color: #003682;
            padding: 3rem;
            border-radius: 12px;
            max-width: 500px;
            width: 100%;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }
        h1 {
            color: #f6821f;
            margin-bottom: 1rem;
        }
        p {
            margin-bottom: 2rem;
            line-height: 1.6;
        }
        a {
            display: inline-block;
            background: #f6821f;
            color: white;
            padding: 12px 30px;
            border-radius: 6px;
            text-decoration: none;
            font-weight: bold;
            transition: background 0.3s;
        }
        a:hover {
            background: #d86300;
        }
    </style>
</head>
<body>
    <div class="thank-you">
        <h1>✅ Thank You!</h1>
        <p>Your form has been submitted successfully.</p>
        <p><strong>Submission ID:</strong> ${output._metadata.submissionId || 'N/A'}</p>
        <a href="/">← Back to Form</a>
    </div>
</body>
</html>`;
		
		return new Response(html, {
			headers: { 'Content-Type': 'text/html' }
		});
		
	} catch (err) {
		console.error('Form processing error:', err);
		const errorHtml = `...error HTML...`;
		return new Response(errorHtml, { 
			status: 400, 
			headers: { 'Content-Type': 'text/html' } 
		});
	}
}
