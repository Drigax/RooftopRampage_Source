#ifdef GL_ES
    precision highp float;
#endif

#define PI 3.1415926538

// Samplers
varying vec2 vUV;
uniform sampler2D textureSampler;

// Parameters
uniform vec2 curvature;
uniform vec2 screenResolution;
uniform vec2 scanLineOpacity;
uniform float vignetteOpacity;
uniform float brightness;
uniform float vignetteRoundness;


vec2 curveRemapUV(vec2 uv)
{
    // as we near the edge of our screen apply greater distortion using a sinusoid.

    uv = uv * 2.0 - 1.0;
    vec2 offset = abs(uv.yx) / vec2(curvature.x, curvature.y);
    uv = uv + uv * offset * offset;
    uv = uv * 0.5 + 0.5;
    return uv;
}

vec4 scanLineIntensity(float uv, float resolution, float opacity)
{
    float intensity = sin(uv * resolution * PI * 2.0);
    intensity = ((0.5 * intensity) + 0.5) * 0.9 + 0.1;
    return vec4(vec3(pow(intensity, opacity)), 1.0);
}

vec4 vignetteIntensity(vec2 uv, vec2 resolution, float opacity, float roundness)
{
    float intensity = uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
    return vec4(vec3(clamp(pow((resolution.x / roundness) * intensity, opacity), 0.0, 1.0)), 1.0);
}

void main(void)
{
    vec2 remappedUV = curveRemapUV(vec2(vUV.x, vUV.y));
    vec4 baseColor = texture2D(textureSampler, remappedUV);

    baseColor *= vignetteIntensity(remappedUV, screenResolution, vignetteOpacity, vignetteRoundness);

    baseColor *= scanLineIntensity(remappedUV.x, screenResolution.y, scanLineOpacity.x);
    baseColor *= scanLineIntensity(remappedUV.y, screenResolution.x, scanLineOpacity.y);

    baseColor *= vec4(vec3(brightness), 1.0);

    if (remappedUV.x < 0.0 || remappedUV.y < 0.0 || remappedUV.x > 1.0 || remappedUV.y > 1.0){
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
        gl_FragColor = baseColor;
    }
}