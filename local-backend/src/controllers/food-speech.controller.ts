import { Controller, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { jsonData, jsonError, rejectUnauthorized } from "../lib/http";
import { audioFallback, maxAudioBytes, transcribeAudio } from "../lib/speech";

@Controller("api/v1/food/speech")
export class FoodSpeechController {
  @Post()
  async transcribe(@Req() request: Request, @Res() response: Response) {
    if (rejectUnauthorized(request, response)) return;
    if (!Buffer.isBuffer(request.body) || !request.body.length || request.body.length > maxAudioBytes) {
      return response.status(400).json(jsonError("INVALID_AUDIO", audioFallback, 400));
    }
    const text = await transcribeAudio(request.body, request.header("X-Whisper-Prompt") ?? "");
    return response.json(jsonData({ text, understood: Boolean(text), message: text ? null : audioFallback }));
  }
}
