package com.example.springbootthymeleaf;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import java.util.List;

@Controller
@RequestMapping("/")
public class RootController {
    @GetMapping
    public String index(Model model) {
        model.addAttribute("name", "Wim");
        model.addAttribute("favoriteMovies", List.of("Avatar", "I, Robot"));
        return "index";
    }
}
