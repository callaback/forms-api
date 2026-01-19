// /functions/api/submit.js
export async function onRequestPost({ request, env }) {
	try {
		let input = await request.formData();

		// Convert FormData to JSON
		// NOTE: Allows multiple values per key
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
			userAgent,
			storedInDB: false
		};

		// Write to D1 database if available
		if (env && env.DB) {
			try {
				// Prepare platforms data
				let platforms = '';
				if (output.platforms) {
					if (Array.isArray(output.platforms)) {
						platforms = output.platforms.join(', ');
					} else {
						platforms = output.platforms;
					}
				}

				// Insert into database
				const result = await env.DB.prepare(`
					INSERT INTO submissions (
						name, email, referers, platforms, 
						message, newsletter, ip, user_agent, timestamp
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
				`).bind(
					output.name || '',
					output.email || '',
					output.referers || '',
					platforms,
					output.message || '',
					output.newsletter === 'subscribe' ? 1 : 0,
					ip,
					userAgent,
					timestamp
				).run();

				if (result.success) {
					// Get the inserted ID
					const idResult = await env.DB.prepare(
						"SELECT last_insert_rowid() as id"
					).first();
					
					output._metadata.storedInDB = true;
					output._metadata.databaseId = idResult?.id;
					output._metadata.success = true;
				}
			} catch (dbError) {
				console.error('D1 Database error:', dbError);
				output._metadata.dbError = dbError.message;
				output._metadata.storedInDB = false;
			}
		} else {
			output._metadata.dbWarning = 'D1 database not configured (env.DB missing)';
		}

		// Return formatted JSON (same as before but with metadata)
		let pretty = JSON.stringify(output, null, 2);
		return new Response(pretty, {
			headers: {
				'Content-Type': 'application/json;charset=utf-8'
			}
		});
	} catch (err) {
		console.error('Form processing error:', err);
		return new Response(JSON.stringify({
			error: 'Error parsing form content',
			details: err.message,
			timestamp: new Date().toISOString()
		}, null, 2), {
			status: 400,
			headers: {
				'Content-Type': 'application/json;charset=utf-8'
			}
		});
	}
}
